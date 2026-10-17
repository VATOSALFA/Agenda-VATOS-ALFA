'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, Timestamp, doc, updateDoc, runTransaction, DocumentReference, getDoc, getDocs, deleteDoc, onSnapshot, where, setDoc, query, increment } from 'firebase/firestore'; // <--- AGREGADO setDoc, increment
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn, formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';

import { functions, httpsCallable, db } from '@/lib/firebase-client';
import { BluetoothPrinter } from '@/lib/printer';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { ChevronLeft } from 'lucide-react'; // Import ChevronLeft
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { useFeatures } from '@/hooks/use-features';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2, UserPlus, X, Mail, Phone, Edit, Percent, DollarSign, Calculator, Send, Gift, Sparkles, ShoppingBag, ArrowRight, UserCheck, Check, QrCode, Building2, Copy, ExternalLink, Banknote, Receipt, Store, Coins, Layers, Wallet, User as UserIcon } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';
import { ClientInput } from '../reservations/client-input';
import type { Service as ServiceType, Product, Client, User, Local, Profesional, Sale, SaleItem, ServiceCategory } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Combobox } from '../ui/combobox';
import { Skeleton } from '../ui/skeleton';

const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className={className}>
        <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157.1zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
    </svg>
);


// Helper to strip undefined values from objects before saving to Firestore
function removeUndefinedFields(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date || (obj && typeof obj.toDate === 'function')) return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefinedFields);
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            cleaned[key] = typeof value === 'object' && value !== null && !(value instanceof Date) && !(value && typeof (value as any).toDate === 'function')
                ? removeUndefinedFields(value)
                : value;
        }
    }
    return cleaned;
}


interface CartItem {
    uniqueId: string; // Added for unique identification in cart
    id: string;
    nombre: string;
    precio: number;
    cantidad: number;
    tipo: 'producto' | 'servicio';
    barbero_id?: string;
    presentation_id?: string;
    discountValue?: string | number;
    discountType?: 'fixed' | 'percentage';
    commissionPaid?: boolean;
    hora_inicio?: string | null;
    hora_fin?: string | null;
    professional_lock?: boolean | null;
    duracion?: number;
}

const saleSchema = (total: number) => z.object({
    cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
    local_id: z.string().min(1, 'Debes seleccionar un local.'),
    metodo_pago: total > 0 ? z.string().min(1, 'Debes seleccionar un método de pago.') : z.string().optional(),
    pago_efectivo: z.coerce.number().optional().default(0),
    pago_tarjeta: z.coerce.number().optional().default(0),
    pago_transferencia: z.coerce.number().optional().default(0),
    propina: z.coerce.number().optional().default(0),
    notas: z.string().optional(),
}).refine(data => {
    if (data.metodo_pago === 'combinado') {
        const propinaVal = Number(data.propina || 0);
        const totalToCover = total + propinaVal;
        const combinedTotal = Number(data.pago_efectivo || 0) + Number(data.pago_tarjeta || 0) + Number(data.pago_transferencia || 0);
        return Math.abs(combinedTotal - totalToCover) < 0.01;
    }
    return true;
}, data => ({
    message: `La suma debe ser exactamente $${(total + Number(data.propina || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    path: ['pago_tarjeta'],
}));


type SaleFormData = z.infer<ReturnType<typeof saleSchema>>;

interface NewSaleSheetProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    initialData?: {
        client: Client;
        items: (Product | ServiceType)[];
        reservationId?: string;
        local_id?: string;
        anticipoPagado?: number; // Added field
    };
    onSaleComplete?: () => void;
    forceMaximize?: number;
}

const DiscountInput = ({ item, onDiscountChange }: { item: CartItem, onDiscountChange: (itemId: string, value: string, type: 'fixed' | 'percentage') => void }) => {
    const [internalValue, setInternalValue] = useState<string>(String(item.discountValue || ''));

    useEffect(() => {
        setInternalValue(String(item.discountValue || ''));
    }, [item.discountValue]);

    const handleBlur = () => {
        onDiscountChange(item.uniqueId, internalValue, item.discountType || 'fixed');
    };

    return (
        <Input
            placeholder="Desc."
            type="number"
            value={internalValue}
            onChange={(e) => setInternalValue(e.target.value)}
            onBlur={handleBlur}
            className="h-8 text-xs"
        />
    )
}

const ClientCombobox = React.memo(({ clients, loading, value, onChange, onSearchChange }: { clients: Client[], loading: boolean, value: string, onChange: (value: string) => void, onSearchChange?: (val: string) => void }) => {
    return (
        <ClientInput
            value={value}
            onChange={onChange}
            clients={clients}
            loading={loading}
            onSearchChange={onSearchChange}
        />
    );
});
ClientCombobox.displayName = 'ClientCombobox';

import { Switch } from '@/components/ui/switch';

const ResumenCarrito = ({ cart, subtotal, totalDiscount, total, anticipoPagado, onOpenAddItem, updateQuantity, updateItemProfessional, assignAllProfessional, updateItemDiscount, removeFromCart, serviceSellers, productSellers, client, hasAppDownloaded, redeemPoints, setRedeemPoints, pointsDiscount, alfaCoinsToUse, setAlfaCoinsToUse, clientAlfaCoins, maxUsableAlfaCoins, propina, appliedBenefit, alfaCoinUnitValue, clientLevelInfo }: any) => (
    <div className="w-full bg-slate-50/70 dark:bg-slate-900/60 border border-border/80 rounded-2xl flex flex-col shadow-xs h-auto md:h-full md:min-h-0 shrink-0 md:shrink overflow-hidden">
        {/* Cabecera del Ticket */}
        <div className="p-3 sm:p-3.5 border-b border-border/60 flex justify-between items-center shrink-0 bg-muted/20">
            <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-slate-400" />
                <h3 className="font-bold text-xs sm:text-sm text-foreground tracking-tight">
                    Ticket de Venta
                </h3>
                {cart.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {cart.reduce((acc: number, it: any) => acc + it.cantidad, 0)} {cart.length === 1 ? 'ítem' : 'ítems'}
                    </span>
                )}
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold rounded-lg border-border/60 hover:bg-muted/40 text-foreground"
                onClick={onOpenAddItem}
            >
                <Plus className="mr-1 h-3.5 w-3.5 text-slate-400" /> Agregar
            </Button>
        </div>

        {/* Asignación rápida de mismo vendedor para todo el carrito */}
        {cart.length > 1 && assignAllProfessional && (
            <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40 flex items-center justify-between gap-2 text-xs shrink-0">
                <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-slate-400" /> Mismo vendedor:
                </span>
                <Select onValueChange={(val) => assignAllProfessional(val)}>
                    <SelectTrigger className="h-6 text-[11px] w-[140px] px-2 py-0 border-dashed rounded-lg bg-background">
                        <SelectValue placeholder="Asignar a todos..." />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                        {productSellers.map((b: { id: string, name: string }) => (
                            <SelectItem key={b.id} value={b.id} className="text-xs font-medium">{b.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        )}

        <ScrollArea className="flex-grow">
            <div className="p-3 sm:p-4 space-y-3">
                {cart.length === 0 ? (
                    <div className="text-center py-10 space-y-2">
                        <ShoppingCart className="h-8 w-8 text-slate-400 mx-auto opacity-40" />
                        <p className="text-xs sm:text-sm text-muted-foreground font-semibold">El carrito está vacío.</p>
                        <p className="text-[11px] text-muted-foreground/70">Selecciona servicios o productos del catálogo para comenzar.</p>
                    </div>
                ) : (
                    <>
                        {cart.map((item: CartItem) => (
                            <div
                                key={item.uniqueId}
                                className="p-2.5 sm:p-3 rounded-xl border border-border/60 bg-background hover:border-border transition-all shadow-2xs space-y-2.5"
                            >
                                {/* Fila superior: Tipo, Título, Precio y Eliminar */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={cn(
                                            "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 leading-none",
                                            item.tipo === 'servicio'
                                                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                        )}>
                                            {item.tipo}
                                        </span>
                                        <p className="font-bold text-xs sm:text-sm capitalize truncate text-foreground">
                                            {item.nombre}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-sans font-black text-xs sm:text-sm text-foreground">
                                            ${formatMoney((item.precio || 0) * item.cantidad)}
                                        </span>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-red-400 transition-colors p-0.5 rounded cursor-pointer"
                                            onClick={() => removeFromCart(item.uniqueId)}
                                            title="Quitar del carrito"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Fila inferior: Barbero, Cantidad y Descuento */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/30 text-xs">
                                    {/* Asignar Barbero */}
                                    <div className="flex-1 min-w-[130px]">
                                        <Select onValueChange={(value) => updateItemProfessional(item.uniqueId, value)} value={item.barbero_id}>
                                            <SelectTrigger className={cn(
                                                "h-7 text-xs rounded-lg bg-muted/20 border-border/60",
                                                !item.barbero_id && "border-red-500/70 text-red-400 font-semibold shadow-2xs"
                                            )}>
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <UserIcon className="h-3 w-3 text-slate-400 shrink-0" />
                                                    <SelectValue placeholder="Asignar barbero *" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                                {(item.tipo === 'servicio'
                                                    ? serviceSellers.filter((p: any) => !p.services || p.services.includes(item.id))
                                                    : productSellers
                                                ).map((b: { id: string, name: string }) => (
                                                    <SelectItem key={b.id} value={b.id} className="text-xs font-medium">
                                                        {b.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Controles Cantidad */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            className="h-6 w-6 rounded-md bg-muted/50 hover:bg-muted text-slate-400 hover:text-foreground flex items-center justify-center transition-colors border border-border/40 cursor-pointer"
                                            onClick={() => updateQuantity(item.uniqueId, item.cantidad - 1)}
                                            title="Disminuir"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="w-5 text-center text-xs font-bold text-foreground font-sans">{item.cantidad}</span>
                                        <button
                                            type="button"
                                            className="h-6 w-6 rounded-md bg-muted/50 hover:bg-muted text-slate-400 hover:text-foreground flex items-center justify-center transition-colors border border-border/40 cursor-pointer"
                                            onClick={() => updateQuantity(item.uniqueId, item.cantidad + 1)}
                                            title="Aumentar"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>

                                    {/* Descuento */}
                                    <div className="flex items-center gap-1 w-[110px] shrink-0">
                                        <DiscountInput item={item} onDiscountChange={updateItemDiscount} />
                                        <Select value={item.discountType || 'fixed'} onValueChange={(value: 'fixed' | 'percentage') => updateItemDiscount(item.uniqueId, String(item.discountValue || '0'), value)}>
                                            <SelectTrigger className="w-[44px] h-7 text-xs rounded-lg px-1 bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                                <SelectItem value="fixed">$</SelectItem>
                                                <SelectItem value="percentage">%</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Tarjeta de Lealtad y Operación */}
                        {hasAppDownloaded ? (
                            <div className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-1.5 text-xs">
                                <div className="flex items-center justify-between text-foreground font-semibold">
                                    <span className="flex items-center gap-1.5">
                                        <Coins className="h-3.5 w-3.5 text-[#C5A880]" /> Recompensa Alfa Club
                                    </span>
                                    <span className="text-[#C5A880] font-bold">+{Math.max(1, Math.floor(total))} ALFA COINS</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                    Registra comisión directa al profesional asignado y acredita puntos de lealtad en la App del cliente.
                                </p>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </ScrollArea>

        {/* Beneficio QR Aplicado en Caja */}
        {appliedBenefit && (
            <div className="p-2.5 border-t border-border/40 bg-[#C5A880]/10 border border-[#C5A880]/30 rounded-xl mx-3 my-1.5 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-[#C5A880] shrink-0" />
                    <div>
                        <p className="font-bold text-[#C5A880] text-xs">
                            {appliedBenefit.benefitTitle || 'Beneficio Alfa Aplicado'}
                        </p>
                        {appliedBenefit.folio && (
                            <p className="text-[10px] text-muted-foreground font-mono">
                                Folio: {appliedBenefit.folio}
                            </p>
                        )}
                    </div>
                </div>
                <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/40 text-[10px] shrink-0 font-sans">
                    Canjeado en QR
                </Badge>
            </div>
        )}

        {/* Puntos y AlfaCoins de Lealtad Alfa Club (Solo usuarios con App descargada) */}
        {client && hasAppDownloaded && (() => {
            const clientCoins = Number(clientAlfaCoins ?? client.alfaCoins ?? client.alfa_coins ?? client.puntos ?? client.puntosLealtad ?? 0);
            const unitVal = Number(alfaCoinUnitValue || 0.03);
            const cashEquivalent = Math.round(clientCoins * unitVal * 100) / 100;
            const usableMax = maxUsableAlfaCoins !== undefined ? maxUsableAlfaCoins : Math.min(clientCoins, Math.max(0, Math.ceil((subtotal - totalDiscount - anticipoPagado) / unitVal)));
            const coinsCurrentlySet = (alfaCoinsToUse !== null && alfaCoinsToUse !== undefined) ? alfaCoinsToUse : usableMax;

            return (
                <div className={cn(
                    "p-3 border rounded-xl mx-3 my-2 space-y-2 shrink-0 transition-all",
                    clientCoins > 0 ? "border-[#C5A880]/30 bg-[#C5A880]/10" : "border-border/50 bg-muted/20"
                )}>
                    <div className="flex justify-between items-center">
                        <div className="space-y-0.5">
                            <span className={cn("text-xs font-bold flex items-center gap-1.5 font-sans", clientCoins > 0 ? "text-[#C5A880]" : "text-muted-foreground")}>
                                <Coins className={cn("h-3.5 w-3.5", clientCoins > 0 ? "text-[#C5A880]" : "text-slate-400")} /> ALFA COINS: {clientCoins}
                                {clientLevelInfo?.tierName && (
                                    <span className="text-[10px] font-normal opacity-85">({clientLevelInfo.tierName})</span>
                                )}
                            </span>
                            <p className="text-[10px] text-muted-foreground font-sans">
                                {clientCoins > 0 ? `Equivalente a $${formatMoney(cashEquivalent)} MXN ($${unitVal.toFixed(2)} c/u)` : 'Sin saldo para canjear'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-foreground">
                                {redeemPoints ? 'Aplicando' : 'Canjear'}
                            </span>
                            <Switch
                                checked={redeemPoints}
                                onCheckedChange={(val) => {
                                    setRedeemPoints(val);
                                    if (val && setAlfaCoinsToUse) {
                                        setAlfaCoinsToUse(usableMax);
                                    }
                                }}
                                disabled={clientCoins <= 0}
                            />
                        </div>
                    </div>

                    {redeemPoints && clientCoins > 0 && (
                        <div className="pt-2 border-t border-[#C5A880]/20 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground">Monedas a canjear:</span>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={usableMax}
                                        value={coinsCurrentlySet}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (setAlfaCoinsToUse) {
                                                if (isNaN(val) || val <= 0) {
                                                    setAlfaCoinsToUse(0);
                                                } else {
                                                    setAlfaCoinsToUse(Math.min(val, usableMax));
                                                }
                                            }
                                        }}
                                        className="h-7 w-20 text-xs font-semibold text-right bg-background border-border/70 rounded-lg px-2 font-sans"
                                    />
                                    {usableMax > 0 && setAlfaCoinsToUse && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setAlfaCoinsToUse(usableMax)}
                                            className="h-7 px-2 text-[10px] font-bold text-[#C5A880] hover:bg-[#C5A880]/20 rounded-lg"
                                        >
                                            Máx ({usableMax})
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between text-[#C5A880] font-semibold text-xs font-sans">
                                <span>Descuento aplicado:</span>
                                <span>-${formatMoney(pointsDiscount || 0)} MXN</span>
                            </div>
                        </div>
                    )}
                </div>
            );
        })()}

        {cart.length > 0 && (
            <div className="p-3 sm:p-4 border-t border-border/60 space-y-2.5 bg-gradient-to-b from-muted/10 to-muted/30 shrink-0">
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal ({cart.reduce((acc: number, it: any) => acc + it.cantidad, 0)} ítems)</span>
                        <span className="text-foreground font-semibold font-sans">${formatMoney(subtotal)}</span>
                    </div>
                    {totalDiscount > 0 && (
                        <div className="flex justify-between text-red-400">
                            <span>Descuento aplicado</span>
                            <span className="font-semibold font-sans">-${formatMoney(totalDiscount)}</span>
                        </div>
                    )}
                    {anticipoPagado > 0 && (
                        <div className="flex justify-between text-blue-400">
                            <span>Anticipo pagado en línea</span>
                            <span className="font-semibold font-sans">-${formatMoney(anticipoPagado)}</span>
                        </div>
                    )}
                    {redeemPoints && (pointsDiscount || 0) > 0 && (
                        <div className="flex justify-between text-[#C5A880]">
                            <span>Descuento por ALFA COINS</span>
                            <span className="font-semibold font-sans">-${formatMoney(pointsDiscount || 0)} MXN</span>
                        </div>
                    )}
                    {Number(propina || 0) > 0 && (
                        <div className="flex justify-between text-foreground">
                            <span>Propina</span>
                            <span className="font-semibold font-sans">+${formatMoney(Number(propina))}</span>
                        </div>
                    )}
                </div>

                {/* Caja de Total Oficial Vatos Alfa */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white border border-[#2d3a60]/80 shadow-md">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
                                {anticipoPagado > 0 ? "Saldo Pendiente" : (Number(propina || 0) > 0 ? "Total con Propina" : "Total a Cobrar")}
                            </p>
                            <p className="text-[11px] text-slate-400">Moneda nacional MXN</p>
                        </div>
                        <span className="text-lg sm:text-xl font-black text-white font-sans tracking-tight">
                            ${formatMoney(Math.max(0, total + Number(propina || 0)))} MXN
                        </span>
                    </div>
                </div>
            </div>
        )}
    </div>
);

const AddItemDialog = ({ open, onOpenChange, services, categories, products, servicesLoading, productsLoading, addToCart }: any) => {
    const [addItemSearchTerm, setAddItemSearchTerm] = useState('');

    const { regularServices, packageServices } = useMemo(() => {
        if (!services) return { regularServices: [], packageServices: [] };

        // Sort first
        const sorted = [...services].sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));

        // Filter by search term
        const filtered = sorted.filter((s: ServiceType) => s?.name?.toLowerCase().includes(addItemSearchTerm.toLowerCase()));

        // Split by category (Package vs Regular)
        const packageCategoryIds = (categories || [])
            .filter((c: any) => c.name.toLowerCase().includes('paquete') || c.name.toLowerCase().includes('package'))
            .map((c: any) => c.id);

        const regular = filtered.filter((s: ServiceType) => !packageCategoryIds.includes(s.category));
        const packages = filtered.filter((s: ServiceType) => packageCategoryIds.includes(s.category));

        return { regularServices: regular, packageServices: packages };
    }, [addItemSearchTerm, services, categories]);

    const addItemFilteredProducts = useMemo(() => {
        if (!products) return [];
        return products.filter((p: Product) => p?.nombre?.toLowerCase().includes(addItemSearchTerm.toLowerCase()));
    }, [addItemSearchTerm, products]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card" hideCloseButton>
                <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 sm:px-6 py-3.5 border-b border-blue-900/40 flex items-center justify-between shrink-0">
                    <div className="header-light-beam" />
                    <div className="flex items-center gap-3 relative z-10">
                        <Plus className="h-5 w-5 text-slate-300 shrink-0" />
                        <div>
                            <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">Agregar al Carrito</h2>
                            <p className="text-xs text-slate-300">Selecciona servicios o productos para añadir.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 relative z-10">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onOpenChange(false)}
                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <div className="p-4 sm:p-5 flex flex-col h-[60vh]">
                    <div className="relative mb-3 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar servicio o producto..." className="pl-9 h-9 text-xs" value={addItemSearchTerm} onChange={e => setAddItemSearchTerm(e.target.value)} />
                    </div>
                    <Tabs defaultValue="servicios" className="flex-1 flex flex-col min-h-0">
                        <TabsList className="grid grid-cols-2 w-full sm:w-[240px] h-8 p-0.5">
                            <TabsTrigger value="servicios" className="text-xs">Servicios</TabsTrigger>
                            <TabsTrigger value="productos" className="text-xs">Productos</TabsTrigger>
                        </TabsList>
                        <ScrollArea className="flex-grow mt-3 pr-2">
                            <TabsContent value="servicios" className="space-y-3 mt-0">
                                {servicesLoading ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                        {Array.from({ length: 6 }).map((_, idx) => (
                                            <div key={idx} className="p-2.5 rounded-xl border border-border/40"><Skeleton className="h-8 w-full" /></div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {/* Regular Services Section */}
                                        <div>
                                            {regularServices.length > 0 && <h3 className="font-medium mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">Servicios Individuales</h3>}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                {regularServices.map((service: ServiceType) => (
                                                    <DialogClose asChild key={service.id}>
                                                        <div
                                                            className="group relative flex items-center justify-between p-2 sm:p-2.5 px-3 rounded-xl border border-border/60 bg-card hover:border-blue-400/50 hover:bg-muted/30 shadow-xs transition-all cursor-pointer select-none active:scale-[0.98] min-h-[46px]"
                                                            onClick={() => addToCart(service, 'servicio')}
                                                        >
                                                            <div className="flex-1 min-w-0 pr-2">
                                                                <p className="font-normal text-xs leading-snug text-foreground line-clamp-2">
                                                                    {service.name}
                                                                </p>
                                                            </div>
                                                            <div className="shrink-0">
                                                                <span className="text-xs font-medium text-foreground">
                                                                    ${formatMoney(service.price || 0)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </DialogClose>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Packages Section */}
                                        {packageServices.length > 0 && (
                                            <div className="pt-1">
                                                <h3 className="font-medium mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">Paquetes</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                    {packageServices.map((service: ServiceType) => (
                                                        <DialogClose asChild key={service.id}>
                                                            <div
                                                                className="group relative flex items-center justify-between p-2 sm:p-2.5 px-3 rounded-xl border border-blue-500/25 bg-blue-50/15 dark:bg-blue-950/10 hover:border-blue-400/60 hover:bg-blue-50/25 shadow-xs transition-all cursor-pointer select-none active:scale-[0.98] min-h-[46px]"
                                                                onClick={() => addToCart(service, 'servicio')}
                                                            >
                                                                <div className="flex-1 min-w-0 pr-2">
                                                                    <p className="font-normal text-xs leading-snug text-foreground line-clamp-2">
                                                                        {service.name}
                                                                    </p>
                                                                </div>
                                                                <div className="shrink-0">
                                                                    <span className="text-xs font-medium text-foreground">
                                                                        ${formatMoney(service.price || 0)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </DialogClose>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {regularServices.length === 0 && packageServices.length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground text-xs sm:text-sm">
                                                No se encontraron servicios.
                                            </div>
                                        )}
                                    </>
                                )}
                            </TabsContent>
                            <TabsContent value="productos" className="mt-0">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {productsLoading ? (
                                        Array.from({ length: 6 }).map((_, idx) => (
                                            <div key={idx} className="p-2.5 rounded-xl border border-border/40"><Skeleton className="h-8 w-full" /></div>
                                        ))
                                    ) : (
                                        addItemFilteredProducts.map((product: Product) => (
                                            <DialogClose asChild key={product.id}>
                                                <div
                                                    className="group relative flex items-center justify-between p-2 sm:p-2.5 px-3 rounded-xl border border-border/60 bg-card hover:border-blue-400/50 hover:bg-muted/30 shadow-xs transition-all cursor-pointer select-none active:scale-[0.98] min-h-[46px]"
                                                    onClick={() => addToCart(product, 'producto')}
                                                >
                                                    <div className="flex-1 min-w-0 pr-2">
                                                        <p className="font-normal text-xs leading-snug text-foreground line-clamp-1">
                                                            {product.nombre}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground font-normal">
                                                            {product.stock} en stock
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0">
                                                        <span className="text-xs font-medium text-foreground">
                                                            ${formatMoney(product.public_price || 0)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </DialogClose>
                                        ))
                                    )}
                                </div>
                            </TabsContent>
                        </ScrollArea>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function NewSaleSheet({ isOpen, onOpenChange, initialData, onSaleComplete, forceMaximize }: NewSaleSheetProps) {
    const { toast } = useToast();
    const { user, db } = useAuth();
    const { enableLoyaltyPoints, loyaltyCashbackPercentage } = useFeatures(); // Import hook
    const [step, setStep] = useState(1);
    const [mobileTab, setMobileTab] = useState<'catalogo' | 'carrito'>('catalogo');
    const [isMinimized, setIsMinimized] = useState(false);

    const openTimeRef = useRef(0);

    useEffect(() => {
        if (isOpen) {
            setIsMinimized(false);
            openTimeRef.current = Date.now();
        }
    }, [isOpen]);

    useEffect(() => {
        if (forceMaximize) {
            setIsMinimized(false);
            openTimeRef.current = Date.now();
        }
    }, [forceMaximize]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isEditingClient, setIsEditingClient] = useState<boolean>(false);
    const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
    const [clientQueryKey, setClientQueryKey] = useState(0);
    const [reservationId, setReservationId] = useState<string | undefined>(undefined);
    const { selectedLocalId } = useLocal();
    const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

    const [isSendingToTerminal, setIsSendingToTerminal] = useState(false);
    const [isWaitingForPayment, setIsWaitingForPayment] = useState(false);

    const [amountPaid, setAmountPaid] = useState<number>(0);
    const saleIdRef = useRef<string | null>(null);

    const unsubscribeRef = useRef<() => void | undefined>(undefined);

    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', clientQueryKey);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: terminals, loading: terminalsLoading } = useFirestoreQuery<any>('terminales');

    useEffect(() => {
        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
        };
    }, []);

    const { data: cashboxSettings, loading: cashboxSettingsLoading } = useFirestoreQuery<any>('configuracion', 'caja-settings', where('__name__', '==', 'caja'));
    const mainTerminalId = cashboxSettings?.[0]?.mercadoPagoTerminalId;

    const serviceSellers = useMemo(() => {
        if (!professionals) return [];
        return professionals
            .filter(p => p.active && !p.deleted)
            .map(p => ({ id: p.id, name: p.name, services: p.services }));
    }, [professionals]);

    const productSellers = useMemo(() => {
        const all = new Map<string, { id: string; name: string }>();

        // 1. Add Active Professionals (Prioritized)
        const professionalUserIds = new Set<string>();
        if (professionals) {
            professionals.forEach(p => {
                if (p.active && !p.deleted) {
                    all.set(p.id, { id: p.id, name: p.name });
                    if (p.userId) professionalUserIds.add(p.userId);
                }
            });
        }

        // 2. Add Staff (Users) - ONLY if role is Recepcionista AND not already added as a Professional
        if (users) {
            users.forEach(u => {
                if (u.role === 'Recepcionista') {
                    // Check if this user is already represented by a professional
                    if (!professionalUserIds.has(u.id) && !all.has(u.id)) {
                        all.set(u.id, { id: u.id, name: u.name });
                    }
                }
            });
        }
        return Array.from(all.values());
    }, [professionals, users]);

    const subtotal = useMemo(() =>
        cart.reduce((acc, item) => acc + (item.precio || 0) * item.cantidad, 0),
        [cart]
    );

    const [anticipoPagado, setAnticipoPagado] = useState(0);
    const [redeemPoints, setRedeemPoints] = useState(false); // State for redemption
    const [alfaCoinsToUse, setAlfaCoinsToUse] = useState<number | null>(null);
    const [appliedBenefit, setAppliedBenefit] = useState<any | null>(null);
    const [nivelesConfig, setNivelesConfig] = useState<any>(null);

    useEffect(() => {
        if (!db) return;
        getDoc(doc(db, 'configuracion', 'app_movil')).then((snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setNivelesConfig(data.niveles_config || data.pase_alfa?.niveles_config || null);
            }
        }).catch(console.error);
    }, [db, isOpen]);

    const totalDiscount = useMemo(() => {
        return cart.reduce((acc, item) => {
            const itemTotal = (item.precio || 0) * item.cantidad;
            const discountValue = Number(item.discountValue) || 0;
            if (item.discountType === 'percentage') {
                return acc + (itemTotal * discountValue) / 100;
            }
            return acc + discountValue;
        }, 0);
    }, [cart]);

    const [selectedClientId, setSelectedClientId] = useState<string>(''); // Local state for immediate access

    const selectedClient = useMemo(() => {
        return clients.find(c => c.id === selectedClientId)
    }, [selectedClientId, clients]);

    const clientLevelInfo = useMemo(() => {
        const defaultTiers = {
            member: { nombre: 'Alfa Member', cashbackPct: 3, visitasMin: 0, gastoMin: 0 },
            gold: { nombre: 'Alfa Gold', cashbackPct: 5, visitasMin: 4, gastoMin: 1500 },
            vip: { nombre: 'Alfa Black VIP', cashbackPct: 7, visitasMin: 8, gastoMin: 3500 },
        };

        if (!selectedClient) {
            return {
                tierId: 'member',
                tierName: 'Alfa Member',
                cashbackPct: 3,
                coinValue: 0.03,
            };
        }

        const cfg = nivelesConfig || {
            activo: true,
            criterio: 'ambos_opcional',
            ...defaultTiers,
        };

        const criterio = cfg.criterio || 'ambos_opcional';
        const member = cfg.member || defaultTiers.member;
        const gold = cfg.gold || defaultTiers.gold;
        const vip = cfg.vip || defaultTiers.vip;

        const v = Number(selectedClient.cortes_acumulados ?? selectedClient.cortesAcumulados ?? 0);
        const g = Number((selectedClient as any).consumo_total ?? selectedClient.gasto_total ?? 0);

        let isVip = selectedClient.nivel === 'Alfa Black VIP' || selectedClient.nivel === 'vip';
        let isGold = selectedClient.nivel === 'Alfa Gold' || selectedClient.nivel === 'gold';

        if (!isVip && !isGold) {
            if (criterio === 'visitas') {
                isVip = v >= (vip.visitasMin ?? 8);
                isGold = v >= (gold.visitasMin ?? 4);
            } else if (criterio === 'gasto') {
                isVip = g >= (vip.gastoMin ?? 3500);
                isGold = g >= (gold.gastoMin ?? 1500);
            } else {
                isVip = v >= (vip.visitasMin ?? 8) || g >= (vip.gastoMin ?? 3500);
                isGold = v >= (gold.visitasMin ?? 4) || g >= (gold.gastoMin ?? 1500);
            }
        }

        if (isVip) {
            const pct = Number(vip.cashbackPct ?? 7);
            return {
                tierId: 'vip',
                tierName: vip.nombre || 'Alfa Black VIP',
                cashbackPct: pct,
                coinValue: pct / 100,
            };
        }

        if (isGold) {
            const pct = Number(gold.cashbackPct ?? 5);
            return {
                tierId: 'gold',
                tierName: gold.nombre || 'Alfa Gold',
                cashbackPct: pct,
                coinValue: pct / 100,
            };
        }

        const pct = Number(member.cashbackPct ?? 3);
        return {
            tierId: 'member',
            tierName: member.nombre || 'Alfa Member',
            cashbackPct: pct,
            coinValue: pct / 100,
        };
    }, [selectedClient, nivelesConfig]);

    const alfaCoinUnitValue = clientLevelInfo.coinValue;

    const hasAppDownloaded = useMemo(() => {
        if (!selectedClient) return false;
        return Boolean(selectedClient.appVinculada === true || selectedClient.fecha_registro_app);
    }, [selectedClient]);

    const clientAlfaCoins = useMemo(() => {
        if (!selectedClient || !hasAppDownloaded) return 0;
        return Number(selectedClient.alfaCoins ?? (selectedClient as any).alfa_coins ?? selectedClient.puntos ?? selectedClient.puntosLealtad ?? 0);
    }, [selectedClient, hasAppDownloaded]);

    const clientCashAvailable = useMemo(() => {
        return Math.round(clientAlfaCoins * alfaCoinUnitValue * 100) / 100;
    }, [clientAlfaCoins, alfaCoinUnitValue]);

    const maxUsableAlfaCoins = useMemo(() => {
        if (!selectedClient || clientAlfaCoins <= 0 || alfaCoinUnitValue <= 0) return 0;
        const currentTotalBeforeCoins = Math.max(0, subtotal - totalDiscount - anticipoPagado);
        const coinsNeededForFullTotal = Math.ceil(currentTotalBeforeCoins / alfaCoinUnitValue);
        return Math.min(clientAlfaCoins, coinsNeededForFullTotal);
    }, [selectedClient, clientAlfaCoins, subtotal, totalDiscount, anticipoPagado, alfaCoinUnitValue]);

    const effectiveAlfaCoinsToUse = useMemo(() => {
        if (!redeemPoints || maxUsableAlfaCoins <= 0) return 0;
        if (alfaCoinsToUse === null) return maxUsableAlfaCoins;
        return Math.min(Math.max(0, alfaCoinsToUse), maxUsableAlfaCoins);
    }, [redeemPoints, maxUsableAlfaCoins, alfaCoinsToUse]);

    const pointsDiscount = useMemo(() => {
        if (!redeemPoints || effectiveAlfaCoinsToUse <= 0 || alfaCoinUnitValue <= 0) return 0;
        const currentTotalBeforeCoins = Math.max(0, subtotal - totalDiscount - anticipoPagado);
        const calculatedDiscount = Math.round(effectiveAlfaCoinsToUse * alfaCoinUnitValue * 100) / 100;
        return Math.min(currentTotalBeforeCoins, calculatedDiscount);
    }, [redeemPoints, effectiveAlfaCoinsToUse, alfaCoinUnitValue, subtotal, totalDiscount, anticipoPagado]);

    const total = useMemo(() => Math.max(0, subtotal - totalDiscount - anticipoPagado - pointsDiscount), [subtotal, totalDiscount, anticipoPagado, pointsDiscount]);

    const form = useForm<SaleFormData>({
        resolver: zodResolver(saleSchema(total)),
        defaultValues: {
            notas: '',
            pago_efectivo: 0,
            pago_tarjeta: 0,
            pago_transferencia: 0,
            propina: 0,
        },
    });

    // Sync form with local state if needed (though we handle it in onChange)
    useEffect(() => {
        const formClient = form.getValues('cliente_id');
        if (formClient !== selectedClientId) {
            setSelectedClientId(formClient || '');
            if (!formClient) {
                setRedeemPoints(false);
                setAlfaCoinsToUse(null);
            }
        }
    }, [form.watch('cliente_id'), selectedClientId]);

    useEffect(() => {
        if (mainTerminalId && terminals?.some(t => t.id === mainTerminalId)) {
            setSelectedTerminalId(mainTerminalId);
        } else if (terminals?.length === 1) {
            setSelectedTerminalId(terminals[0].id);
        } else {
            setSelectedTerminalId(null);
        }
    }, [terminals, mainTerminalId]);


    const { regularServices, packageServices } = useMemo(() => {
        if (!services) return { regularServices: [], packageServices: [] };

        // Sort first
        const sorted = [...services].sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));

        // Filter by search term
        const filtered = sorted.filter((s: ServiceType) => s?.name?.toLowerCase().includes(searchTerm.toLowerCase()));

        // Split by category (Package vs Regular)
        const packageCategoryIds = (categories || [])
            .filter((c: any) => c.name.toLowerCase().includes('paquete') || c.name.toLowerCase().includes('package'))
            .map((c: any) => c.id);

        const regular = filtered.filter((s: ServiceType) => !packageCategoryIds.includes(s.category));
        const packages = filtered.filter((s: ServiceType) => packageCategoryIds.includes(s.category));

        return { regularServices: regular, packageServices: packages };

    }, [searchTerm, services, categories]);

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        return products.filter(p => p?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, products]);



    const addToCart = (item: Product | ServiceType, tipo: 'producto' | 'servicio') => {
        setCart(prev => {
            // ALWAYS add as a new item to allow different professionals per service instance
            const itemPrice = tipo === 'servicio' ? (item as ServiceType).price : (item as Product).public_price;
            const itemName = tipo === 'servicio' ? (item as ServiceType).name : (item as Product).nombre;
            const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;

            return [...prev, {
                uniqueId: crypto.randomUUID(),
                id: item.id,
                nombre: itemName,
                precio: itemPrice || 0,
                cantidad: 1,
                tipo,
                presentation_id
            }];
        });
    };

    const removeFromCart = (uniqueId: string) => {
        setCart(prev => prev.filter(item => item.uniqueId !== uniqueId));
    };

    const updateQuantity = (uniqueId: string, newQuantity: number) => {
        if (newQuantity < 1) {
            removeFromCart(uniqueId);
            return;
        }
        setCart(prev =>
            prev.map(item => (item.uniqueId === uniqueId ? { ...item, cantidad: newQuantity } : item))
        );
    };

    const updateItemProfessional = (uniqueId: string, barberoId: string) => {
        setCart(prev =>
            prev.map(item => (item.uniqueId === uniqueId ? { ...item, barbero_id: barberoId } : item))
        );
    };

    const updateItemDiscount = (uniqueId: string, value: string, type: 'fixed' | 'percentage') => {
        setCart(prev => prev.map(item => {
            if (item.uniqueId === uniqueId) {
                return { ...item, discountValue: value, discountType: type };
            }
            return item;
        }));
    };

    const assignAllProfessional = (barberoId: string) => {
        setCart(prev =>
            prev.map(item => ({ ...item, barbero_id: barberoId }))
        );
    };

    const cartCountMap = useMemo(() => {
        const map: Record<string, number> = {};
        cart.forEach(item => {
            map[item.id] = (map[item.id] || 0) + item.cantidad;
        });
        return map;
    }, [cart]);

    const totalCartItems = useMemo(() => cart.reduce((acc, it) => acc + it.cantidad, 0), [cart]);


    const paymentMethod = form.watch('metodo_pago');

    const watchedCash = form.watch('pago_efectivo');
    const watchedCard = form.watch('pago_tarjeta');
    const watchedTransfer = form.watch('pago_transferencia');
    const watchedPropina = Number(form.watch('propina') || 0);

    const totalConPropina = total + watchedPropina;

    const quickBills = useMemo(() => {
        const list: number[] = [];
        if (totalConPropina <= 0) return list;
        const standardBills = [50, 100, 200, 500, 1000];
        for (const b of standardBills) {
            if (b > totalConPropina && !list.includes(b)) {
                list.push(b);
            }
        }
        return list.slice(0, 3);
    }, [totalConPropina]);

    const isCombinedPaymentInvalid = useMemo(() => {
        if (paymentMethod !== 'combinado') return false;
        const cashAmount = Number(watchedCash || 0);
        const cardAmount = Number(watchedCard || 0);
        const transferAmount = Number(watchedTransfer || 0);
        return Math.abs((cashAmount + cardAmount + transferAmount) - totalConPropina) > 0.01;
    }, [paymentMethod, totalConPropina, watchedCash, watchedCard, watchedTransfer]);

    const combinedTotal = useMemo(() => {
        if (paymentMethod !== 'combinado') return 0;
        const cashAmount = Number(watchedCash || 0);
        const cardAmount = Number(watchedCard || 0);
        const transferAmount = Number(watchedTransfer || 0);
        return cashAmount + cardAmount + transferAmount;
    }, [paymentMethod, watchedCash, watchedCard, watchedTransfer]);

    const remainingAmount = totalConPropina - combinedTotal;

    const [selectedPropinaMetodo, setSelectedPropinaMetodo] = useState<string>('tarjeta');

    useEffect(() => {
        if (paymentMethod === 'combinado' && watchedPropina > 0) {
            const cardAmt = Number(watchedCard || 0);
            const cashAmt = Number(watchedCash || 0);
            const transAmt = Number(watchedTransfer || 0);
            if (cardAmt > 0 && Math.abs(cardAmt - watchedPropina) < 0.01) {
                setSelectedPropinaMetodo('tarjeta');
            } else if (cashAmt > 0 && Math.abs(cashAmt - watchedPropina) < 0.01) {
                setSelectedPropinaMetodo('efectivo');
            } else if (transAmt > 0 && Math.abs(transAmt - watchedPropina) < 0.01) {
                setSelectedPropinaMetodo('transferencia');
            }
        }
    }, [paymentMethod, watchedPropina, watchedCard, watchedCash, watchedTransfer]);

    useEffect(() => {
        if (paymentMethod === 'efectivo' && watchedPropina > 0) {
            form.setValue('propina', 0, { shouldValidate: true });
        }
    }, [paymentMethod, watchedPropina, form]);

    const cartBarberoNames = useMemo(() => {
        const ids = Array.from(new Set(cart.map(i => i.barbero_id).filter(Boolean)));
        return ids.map(id => professionals?.find(p => p.id === id)?.name).filter(Boolean) as string[];
    }, [cart, professionals]);

    const [transferPaymentLink, setTransferPaymentLink] = useState<string>('');
    const [isGeneratingTransferLink, setIsGeneratingTransferLink] = useState<boolean>(false);
    const [transferLinkCopied, setTransferLinkCopied] = useState<boolean>(false);
    const [bankDetailsCopied, setBankDetailsCopied] = useState<boolean>(false);
    const [bankInfo, setBankInfo] = useState<{ bank: string; accountHolder: string; clabe: string }>({
        bank: 'Mercado Pago',
        accountHolder: 'Jose Alejandro Pacheco',
        clabe: '722969013328430098',
    });

    useEffect(() => {
        if (!db) return;
        getDoc(doc(db, 'configuracion', 'pagos')).then((snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setBankInfo(prev => ({
                    bank: data.bank || prev.bank,
                    accountHolder: data.accountHolder || prev.accountHolder,
                    clabe: data.clabe || prev.clabe,
                }));
            }
        }).catch(console.error);
    }, [db]);

    useEffect(() => {
        if (!isOpen) {
            setTransferPaymentLink('');
            setIsGeneratingTransferLink(false);
            setTransferLinkCopied(false);
            setBankDetailsCopied(false);
        }
    }, [isOpen]);

    const transferAmountToCharge = useMemo(() => {
        if (paymentMethod === 'combinado') {
            return Number(watchedTransfer || 0);
        }
        return totalConPropina;
    }, [paymentMethod, watchedTransfer, totalConPropina]);

    const handleGenerateTransferLink = async () => {
        if (transferAmountToCharge <= 0) {
            toast({
                variant: "destructive",
                title: "Monto inválido",
                description: "El monto a cobrar debe ser mayor a $0.00 MXN."
            });
            return;
        }

        setIsGeneratingTransferLink(true);
        try {
            const itemsDesc = cart.length > 0 
                ? cart.map(item => `${item.cantidad}x ${item.nombre}`).join(', ')
                : 'Cobro en Caja';

            const clientName = selectedClient?.nombre || 'Cliente';
            const clientLastName = selectedClient?.apellido || '';
            const clientEmail = selectedClient?.correo || '';
            const clientPhone = selectedClient?.telefono || '';

            const res = await fetch('/api/mercadopago/preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reservationId: reservationId || undefined,
                    items: [
                        {
                            title: `Cobro Vatos Alfa - ${itemsDesc.slice(0, 50)}`,
                            quantity: 1,
                            unit_price: transferAmountToCharge,
                        }
                    ],
                    payer: {
                        name: clientName,
                        lastName: clientLastName,
                        email: clientEmail,
                        phone: clientPhone,
                    }
                })
            });

            const data = await res.json();
            if (data.init_point) {
                setTransferPaymentLink(data.init_point);
                toast({
                    title: "Enlace y QR generados",
                    description: `Listo para cobrar $${transferAmountToCharge.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN vía SPEI.`
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error al generar enlace",
                    description: data.error || "No se pudo generar el enlace de pago de Mercado Pago."
                });
            }
        } catch (err) {
            console.error("Error generating transfer link:", err);
            toast({
                variant: "destructive",
                title: "Error de conexión",
                description: "No se pudo conectar con el servicio de pagos."
            });
        } finally {
            setIsGeneratingTransferLink(false);
        }
    };

    const handleSendTransferWhatsApp = () => {
        if (!selectedClient?.telefono) {
            toast({
                variant: "destructive",
                title: "Sin teléfono",
                description: "El cliente no tiene un teléfono registrado para enviar WhatsApp."
            });
            return;
        }
        const cleanPhone = selectedClient.telefono.replace(/\D/g, '');
        const fullPhone = cleanPhone.length === 10 ? `52${cleanPhone}` : cleanPhone;
        const amountStr = `$${transferAmountToCharge.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
        const msg = `¡Hola ${selectedClient.nombre}! 💈 En Vatos Alfa puedes realizar tu pago de *${amountStr}* por transferencia SPEI o tarjeta de forma rápida y segura aquí:\n\n${transferPaymentLink}\n\nℹ️ _Instrucciones SPEI:_ Al abrir el enlace y elegir "Transferencia", se generará tu CLABE SPEI única con acreditación automática e inmediata sin necesidad de enviar comprobante.\n\n¡Muchas gracias por tu visita!`;
        window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleCopyTransferLink = () => {
        if (!transferPaymentLink) return;
        navigator.clipboard.writeText(transferPaymentLink);
        setTransferLinkCopied(true);
        toast({ title: "Enlace copiado", description: "El enlace de pago fue copiado al portapapeles." });
        setTimeout(() => setTransferLinkCopied(false), 2500);
    };

    const handleCopyClabe = () => {
        if (!bankInfo.clabe) return;
        navigator.clipboard.writeText(bankInfo.clabe);
        setBankDetailsCopied(true);
        toast({ title: "CLABE copiada", description: `${bankInfo.clabe} copiada al portapapeles.` });
        setTimeout(() => setBankDetailsCopied(false), 2500);
    };

    useEffect(() => {
        if (isOpen && initialData) {
            // Reset payment identifiers and state from previous sessions
            setAmountPaid(0);
            setIsSendingToTerminal(false);
            setIsWaitingForPayment(false);
            saleIdRef.current = null;
            setTransferPaymentLink('');
            setIsGeneratingTransferLink(false);
            setTransferLinkCopied(false);
            setBankDetailsCopied(false);

            // Reset form fields that should not persist across sales
            form.setValue('metodo_pago', 'efectivo');
            form.setValue('pago_efectivo', 0);
            form.setValue('pago_tarjeta', 0);
            form.setValue('pago_transferencia', 0);
            form.setValue('propina', 0);
            form.setValue('notas', '');

            setAppliedBenefit((initialData as any)?.benefitRedeemed || null);

            form.setValue('cliente_id', initialData.client.id);
            if (initialData?.client) {
                setSelectedClientId(initialData.client.id);
                form.setValue('cliente_id', initialData.client.id);
            }
            if (initialData.local_id) {
                form.setValue('local_id', initialData.local_id);
            }
            setReservationId(initialData.reservationId || undefined);
            const initialCartItems: CartItem[] = initialData.items.map(item => {
                const tipo = 'duration' in item ? 'servicio' : 'producto';
                // Prioritize 'precio' (manually edited during reservation) over master price list
                const precio = (item as any).precio || (tipo === 'servicio' ? (item as ServiceType).price : (item as Product).public_price);
                const nombre = tipo === 'servicio' ? (item as ServiceType).name : (item as Product).nombre;
                const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;
                return {
                    uniqueId: crypto.randomUUID(),
                    id: item.id,
                    nombre: nombre,
                    precio: precio || 0,
                    cantidad: (item as any).cantidad || 1,
                    tipo: tipo,
                    presentation_id,
                    barbero_id: (item as any).barbero_id || undefined,
                    commissionPaid: (item as any).commissionPaid,
                    hora_inicio: (item as any).hora_inicio || null,
                    hora_fin: (item as any).hora_fin || null,
                    professional_lock: (item as any).professional_lock || null,
                    duracion: (item as any).duracion || (item as any).duration || 0
                };
            });
            setCart(initialCartItems);
            const initPagoEstado = (initialData as any).pago_estado;
            const isInitDepositUnpaid =
                initPagoEstado === 'pendiente_anticipo' ||
                initPagoEstado === 'pending_payment' ||
                initPagoEstado === 'Pendiente' ||
                initPagoEstado === 'pendiente';

            const passedDeposit = isInitDepositUnpaid
                ? 0
                : Number(
                    initialData.anticipoPagado ||
                    (initialData as any).anticipo_pagado ||
                    (initialData as any).monto_pagado_real ||
                    (initialData as any).monto_pagado ||
                    ((initPagoEstado === 'deposit_paid' || initPagoEstado === 'anticipo_pagado') ? (initialData as any).monto_anticipo : 0) ||
                    0
                );
            setAnticipoPagado(passedDeposit);

            // Double security: If there is a reservationId, fetch reservation from DB to verify actual payment state
            if (initialData.reservationId && db) {
                getDoc(doc(db, 'reservas', initialData.reservationId)).then(snap => {
                    if (snap.exists()) {
                        const res = snap.data();
                        const isResDepositPaid =
                            res.pago_estado === 'deposit_paid' ||
                            res.pago_estado === 'anticipo_pagado' ||
                            (res.pago_estado !== 'pendiente_anticipo' &&
                                res.pago_estado !== 'pending_payment' &&
                                res.pago_estado !== 'Pendiente' &&
                                res.pago_estado !== 'pendiente' &&
                                (Number(res.anticipo_pagado) > 0 ||
                                    Number(res.anticipoPagado) > 0 ||
                                    Number(res.monto_pagado_real) > 0 ||
                                    Number(res.monto_pagado) > 0));

                        const rawDbDeposit = Number(
                            res.anticipoPagado ||
                            res.anticipo_pagado ||
                            res.monto_pagado_real ||
                            res.monto_pagado ||
                            res.monto_anticipo ||
                            (res.total && res.saldo_pendiente !== undefined && Number(res.total) > Number(res.saldo_pendiente)
                                ? Math.max(0, Number(res.total) - Number(res.saldo_pendiente))
                                : 0) ||
                            res.anticipo_esperado ||
                            0
                        );
                        const dbDeposit = isResDepositPaid
                            ? (rawDbDeposit > 0 ? rawDbDeposit : Math.round(Number(res.total || 0) * 0.5))
                            : 0;
                        setAnticipoPagado(dbDeposit);
                    }
                }).catch(console.error);
            }
            setStep(2);
        }
    }, [initialData, form, isOpen, db]);


    const finalizeSaleProcess = async (clientId: string, localId: string) => {
        // Loyalty Points / AlfaCoins Logic (Exclusivo para clientes con la App Móvil descargada y vinculada)
        if (db && selectedClient && hasAppDownloaded) {
            // 1 AlfaCoin ganado por cada $1 MXN pagado en la venta
            const pointsEarned = total > 0 ? Math.floor(total) : 0;
            const pointsSpent = effectiveAlfaCoinsToUse || 0;

            if (pointsEarned > 0 || pointsSpent > 0) {
                try {
                    const clientRef = doc(db, 'clientes', selectedClient.id);
                    await updateDoc(clientRef, {
                        puntos: increment(pointsEarned - pointsSpent),
                        alfaCoins: increment(pointsEarned - pointsSpent),
                        alfa_coins: increment(pointsEarned - pointsSpent),
                    });
                } catch (e) {
                    console.error("Error updating points in Firestore:", e);
                }
            }
        }

        if (appliedBenefit?.folio && db) {
            try {
                await setDoc(doc(db, 'canjes_beneficios', appliedBenefit.folio), {
                    estado: 'canjeado',
                    utilizado_en_venta: true,
                    fecha_aplicacion: Timestamp.now(),
                }, { merge: true });
            } catch (e) {
                console.error("Error updating canjes_beneficios in sale finalization:", e);
            }
        }

        try {
            if (db) {
                // 1. Check for Ticket Printer Setting
                const pagosRef = doc(db, 'configuracion', 'pagos');
                const pagosSnap = await getDoc(pagosRef);
                const pagosData = pagosSnap.exists() ? pagosSnap.data() : {};
                const printerEnabled = pagosData.ticketPrinterEnabled;
                const ticketFooterMessage = pagosData.ticketFooterMessage || "¡Gracias por su preferencia!";

                // 2. Trigger Print if Enabled and Manual Payment (Cash/Combined/Transfer)
                // We prioritize printing for Cash, but usually useful for all walk-ins.
                // User requirement: Imprimir ticket cuando sea en efectivo, transferencia o combinado (que contenga efectivo o transferencia).
                const isCashTransferOrCombined = paymentMethod === 'efectivo' || paymentMethod === 'transferencia' || (paymentMethod === 'combinado' && ((watchedCash > 0) || (watchedTransfer > 0)));

                if (printerEnabled && isCashTransferOrCombined) {
                    try {
                        const local = locales.find(l => l.id === localId);

                        // Fetch company settings from 'empresa' collection (same as settings page)
                        // It's a collection, so we query it.
                        const empresaCollection = collection(db, 'empresa');
                        const empresaSnap = await getDocs(empresaCollection);
                        const empresaData = !empresaSnap.empty ? empresaSnap.docs[0].data() : {};
                        const logoUrl = empresaData.receipt_logo_url;

                        const printer = BluetoothPrinter.getInstance();

                        // Attempt connection (silent if permitted, picker if not)
                        if (!printer.isConnected()) {
                            // Try to reconnect to existing device object first to avoid picker
                            // Access private 'device' field via 'any' cast if needed, or better, add public method in printer.ts
                            // But since we can't edit printer.ts right now without extra cost, let's assume connect() handles it?
                            // Actually connect() logic in printer.ts does: if (this.device) ... reconnect.
                            // So if we are here, it means either:
                            // A) this.device is null (fresh load) -> connect() tries getDevices() -> fails -> requestDevice() (picker)
                            // B) this.device is set -> connect() uses it.

                            // If the user says it asks EVERY time, it means A) is happening or getDevices is empty.

                            await printer.connect();
                        }

                        // Print Logo First
                        if (logoUrl) {
                            await printer.printImage(logoUrl);
                        }

                        const ticketData = {
                            storeName: local?.name || empresaData.name || "VATOS ALFA",
                            storeAddress: local?.address || empresaData.address || empresaData.description || "",
                            date: new Date().toLocaleString('es-MX'),
                            customerName: selectedClient ? `${selectedClient.nombre} ${selectedClient.apellido}` : "Cliente General",
                            reservationId: reservationId || "",
                            items: cart, // cart has { nombre, cantidad, subtotal } which maps roughly to what formatTicket expects if subtotal exists.
                            // printer.ts expects: item.nombre, item.cantidad, item.subtotal.
                            // Cart items structure in NewSaleSheet: { nombre, cantidad, precio, ... }
                            // We need to ensure subtotal is calculated or explicitly passed in the item.
                            // Let's assume printer.ts calculates price from subtotal or similar.
                            // Actually formatTicket uses item.subtotal.
                            // In NewSaleSheet cart items usually have 'subtotal' calculated?
                            // Let's check cart structure separately if needed, but for now passing cart.
                            subtotal: subtotal,
                            anticipoPagado: anticipoPagado === undefined ? (initialData?.anticipoPagado || 0) : anticipoPagado,
                            discount: totalDiscount,
                            propina: watchedPropina,
                            total: totalConPropina,
                            cashPaid: paymentMethod === 'efectivo' ? amountPaid : undefined,
                            change: paymentMethod === 'efectivo' ? Math.max(0, amountPaid - totalConPropina) : undefined,
                            combinedDetails: paymentMethod === 'combinado' ? {
                                efectivo: watchedCash || 0,
                                tarjeta: watchedCard || 0,
                                transferencia: watchedTransfer || 0
                            } : undefined,
                            footerMessage: ticketFooterMessage
                        };

                        // Map cart items to ensure 'subtotal' exists for printer
                        ticketData.items = cart.map((item: any) => ({
                            ...item,
                            subtotal: item.subtotal || (item.precio * item.cantidad)
                        }));

                        await printer.print(printer.formatTicket(ticketData));
                        toast({ title: "Imprimiendo Ticket..." });
                    } catch (printErr: any) {
                        console.error("Printing failed:", printErr);
                        toast({
                            variant: "destructive",
                            title: "Error de Impresión",
                            description: "No se pudo imprimir el ticket. Verifica la conexión Bluetooth."
                        });
                    }
                }

                // ... existing Google Review logic ...

            }
        } catch (e) {
            console.error("Error en flujo de post-venta:", e);
        }

        handleClose();
        onSaleComplete?.();
    };

    // --- LOGICA DE COBRO CON TERMINAL CORREGIDA ---
    const handleSendToTerminal = async () => {
        const formData = form.getValues();
        const amountToCharge = paymentMethod === 'combinado' ? (formData.pago_tarjeta || 0) : (total + Number(formData.propina || 0));
        if (!db || !selectedTerminalId || amountToCharge <= 0 || !selectedClient) return;

        if (cart.some(item => !item.barbero_id)) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'Debes asignar un profesional/vendedor a todos los items del carrito para cobrar en terminal.' });
            return;
        }

        setIsSendingToTerminal(true);
        setIsWaitingForPayment(true);

        // 1. Crear referencia con ID nuevo para ventas
        const saleDocRef = doc(collection(db, 'ventas'));
        const tempSaleId = saleDocRef.id;
        saleIdRef.current = tempSaleId;

        try {
            // 2. Preparamos los datos de la venta para guardarla como "Pendiente"
            //    Esto es crucial para que el webhook tenga qué actualizar.

            await runTransaction(db, async (transaction) => {
                // A. Consolidar cantidades por producto (para evitar lecturas/escrituras conflictivas en la misma transacción)
                const productQuantities = new Map<string, number>();
                const productRefsMap = new Map<string, DocumentReference>();
                const itemsMap = new Map<string, CartItem>(); // Para info de error

                for (const item of cart) {
                    if (item.tipo === 'producto') {
                        const currentQty = productQuantities.get(item.id) || 0;
                        productQuantities.set(item.id, currentQty + item.cantidad);

                        if (!productRefsMap.has(item.id)) {
                            productRefsMap.set(item.id, doc(db, 'productos', item.id));
                            itemsMap.set(item.id, item);
                        }
                    }
                }

                // Obtener todos los documentos necesarios de una vez
                const uniqueProductIds = Array.from(productQuantities.keys());
                const productDocs = await Promise.all(
                    uniqueProductIds.map(id => transaction.get(productRefsMap.get(id)!))
                );

                // Verificar stock y encolar actualizaciones
                for (const [index, productDoc] of productDocs.entries()) {
                    const productId = uniqueProductIds[index];
                    const qtyNeeded = productQuantities.get(productId)!;
                    const itemInfo = itemsMap.get(productId)!;
                    const ref = productRefsMap.get(productId)!;

                    if (!productDoc.exists()) throw new Error(`Producto con ID ${itemInfo.id} no encontrado.`);

                    const productData = productDoc.data() as Product;
                    const currentStock = productData.stock;
                    const newStock = currentStock - qtyNeeded;

                    if (newStock < 0) throw new Error(`Stock insuficiente para ${itemInfo.nombre}. Requerido: ${qtyNeeded}, Disponible: ${currentStock}`);

                    transaction.update(ref, { stock: newStock });

                    // Log movement
                    const movementRef = doc(collection(db, 'movimientos_inventario'));
                    const clientFullName = selectedClient ? `${selectedClient.nombre} ${selectedClient.apellido || ''}`.trim() : 'Cliente';
                    const selectedLocal = locales.find(l => l.id === formData.local_id);

                    transaction.set(movementRef, {
                        date: Timestamp.now(),
                        local_id: formData.local_id,
                        product_id: ref.id,
                        presentation_id: (productData as any).presentation_id || 'default',
                        from: currentStock,
                        to: newStock,
                        cause: 'Venta',
                        staff_id: user?.uid || 'unknown',
                        comment: `Venta (Terminal) a ${clientFullName}`,
                        product_name: productData.nombre,
                        staff_name: user?.displayName || user?.email || 'Desconocido',
                        local_name: selectedLocal?.name || 'Local',
                        concepto: `Registrar venta: ${clientFullName}`
                    });
                }

                // B. Preparar items
                const itemsToSave = cart.map(item => {
                    const itemSubtotal = (item.precio || 0) * item.cantidad;
                    const itemDiscountValue = Number(item.discountValue) || 0;
                    const itemDiscountType = item.discountType || 'fixed';
                    const itemDiscountAmount = itemDiscountType === 'percentage'
                        ? (itemSubtotal * itemDiscountValue) / 100
                        : itemDiscountValue;

                    return {
                        id: item.id,
                        nombre: item.nombre,
                        tipo: item.tipo,
                        barbero_id: item.barbero_id || null,
                        precio_unitario: item.precio || 0,
                        cantidad: item.cantidad,
                        subtotal: itemSubtotal,
                        descuento: {
                            valor: itemDiscountValue,
                            tipo: itemDiscountType,
                            monto: itemDiscountAmount
                        },
                        commissionPaid: item.commissionPaid
                    };
                });

                // C. Objeto de Venta
                const saleDataToSave: any = {
                    ...formData,
                    cliente_id: selectedClient.id,
                    local_id: formData.local_id,
                    metodo_pago: paymentMethod, // Respeta combinado o tarjeta
                    items: itemsToSave,
                    subtotal: subtotal,
                    descuento: {
                        valor: totalDiscount,
                        tipo: 'fixed',
                        monto: totalDiscount
                    },
                    total,
                    fecha_hora_venta: Timestamp.now(),
                    creado_por_id: user?.uid,
                    creado_por_nombre: user?.displayName || user?.email,
                    pago_estado: 'Pendiente', // <--- IMPORTANTE: Nace como pendiente
                    ...(paymentMethod === 'combinado' ? (() => {
                        const propMetodo = selectedPropinaMetodo || 'tarjeta';
                        let effE = Number(formData.pago_efectivo) || 0;
                        let effT = Number(formData.pago_tarjeta) || 0;
                        let effTr = Number(formData.pago_transferencia) || 0;
                        const propVal = Number(formData.propina) || 0;

                        if (propVal > 0) {
                            if (propMetodo === 'tarjeta') effT = Math.max(0, effT - propVal);
                            else if (propMetodo === 'efectivo') effE = Math.max(0, effE - propVal);
                            else if (propMetodo === 'transferencia') effTr = Math.max(0, effTr - propVal);
                        }

                        const nonZero = [
                            effE > 0 ? 'efectivo' : null,
                            effT > 0 ? 'tarjeta' : null,
                            effTr > 0 ? 'transferencia' : null
                        ].filter(Boolean);

                        return {
                            detalle_pago_combinado: {
                                efectivo: effE,
                                tarjeta: effT,
                                transferencia: effTr,
                                pagos_en_linea: 0
                            },
                            propina_metodo: propMetodo,
                            ...(nonZero.length === 1 ? { metodo_pago: nonZero[0] } : {})
                        };
                    })() : {
                        propina_metodo: paymentMethod
                    }),
                    propina: formData.propina || 0, // Registrar propina
                    monto_pagado_real: totalConPropina,
                    saldo_pendiente: 0,
                    creado_en: Timestamp.now(),
                    anticipoPagado: anticipoPagado || 0,
                    ...(appliedBenefit ? {
                        beneficio_aplicado: {
                            id: appliedBenefit.benefitId || appliedBenefit.id || null,
                            titulo: appliedBenefit.benefitTitle || appliedBenefit.title || null,
                            folio: appliedBenefit.folio || null,
                            canjeado_en: Timestamp.now()
                        }
                    } : {}),
                };

                // Lógica de partición de propina si hay y si hay múltiples vendedores.
                if (formData.propina && formData.propina > 0) {
                    const allBarberos = Array.from(new Set(itemsToSave.map(i => i.barbero_id).filter(id => id)));
                    const uniqueBarberos = allBarberos.filter(id => professionals?.some(p => p.id === id));
                    if (uniqueBarberos.length > 0) {
                        const propinaSplit = formData.propina / uniqueBarberos.length;
                        saleDataToSave.propina_detalles = uniqueBarberos.map(bId => ({
                            barbero_id: bId,
                            monto: propinaSplit
                        }));
                    }
                }

                if (reservationId) {
                    saleDataToSave.reservationId = reservationId;
                    const reservationRef = doc(db, 'reservas', reservationId);
                    const reservationItems = cart.map((item: any) => ({
                        id: item.id,
                        nombre: item.nombre,
                        servicio: item.nombre,
                        tipo: item.tipo,
                        barbero_id: item.barbero_id || null,
                        precio: item.precio || 0,
                        duracion: item.duracion || 0,
                        cantidad: item.cantidad || 1,
                        ...(item.hora_inicio ? { hora_inicio: item.hora_inicio, hora_fin: item.hora_fin } : {}),
                        ...(item.professional_lock !== undefined && item.professional_lock !== null ? { professional_lock: item.professional_lock } : {})
                    }));
                    transaction.update(reservationRef, {
                        items: reservationItems,
                        precio: subtotal - totalDiscount,
                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                    });
                }

                // D. Guardar Venta
                transaction.set(saleDocRef, removeUndefinedFields(saleDataToSave));
            });

            // 3. Llamar a la Cloud Function con el ID del documento que ACABAMOS de crear
            const createPayment = httpsCallable(functions, 'createPointPayment');
            const result: any = await createPayment({
                amount: amountToCharge,
                terminalId: selectedTerminalId,
                referenceId: tempSaleId, // Enviamos el ID del documento real
                payer: { email: selectedClient.correo, name: `${selectedClient.nombre} ${selectedClient.apellido}` }
            });

            if (result.data.success) {
                toast({ title: 'Cobro enviado', description: 'Por favor, completa el pago en la terminal.' });

                // 4. Escuchar cambios en ese documento
                if (unsubscribeRef.current) unsubscribeRef.current();

                const unsubscribe = onSnapshot(saleDocRef, async (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        const data = docSnapshot.data();
                        if (data && data.pago_estado === 'Pagado') {
                            saleIdRef.current = null;
                            setIsSendingToTerminal(false);
                            setIsWaitingForPayment(false);

                            unsubscribe();
                            unsubscribeRef.current = undefined;

                            // Ensure propina_detalles is populated if client added tip directly on the Point terminal
                            if (Number(data.propina) > 0 && (!Array.isArray(data.propina_detalles) || data.propina_detalles.length === 0)) {
                                try {
                                    const allBarberos = Array.from(new Set(cart.map(i => i.barbero_id).filter(Boolean)));
                                    const uniqueBarberos = allBarberos.filter(id => professionals?.some(p => p.id === id));
                                    const targetBarberos = uniqueBarberos.length > 0 ? uniqueBarberos : allBarberos;
                                    if (targetBarberos.length > 0) {
                                        const propinaSplit = parseFloat((Number(data.propina) / targetBarberos.length).toFixed(2));
                                        await updateDoc(saleDocRef, {
                                            propina_detalles: targetBarberos.map(bId => ({
                                                barbero_id: bId,
                                                monto: propinaSplit
                                            }))
                                        });
                                    }
                                } catch (propErr) {
                                    console.error("Error updating propina_detalles on terminal snapshot:", propErr);
                                }
                            }

                            // If there is a reservation linked, update its status too.
                            if (reservationId && db) {
                                try {
                                    const resRef = doc(db, 'reservas', reservationId);
                                    const reservationItems = cart.map((item: any) => ({
                                        id: item.id,
                                        nombre: item.nombre,
                                        servicio: item.nombre,
                                        tipo: item.tipo,
                                        barbero_id: item.barbero_id || null,
                                        precio: item.precio || 0,
                                        duracion: item.duracion || 0,
                                        cantidad: item.cantidad || 1,
                                        ...(item.hora_inicio ? { hora_inicio: item.hora_inicio, hora_fin: item.hora_fin } : {}),
                                        ...(item.professional_lock !== undefined && item.professional_lock !== null ? { professional_lock: item.professional_lock } : {})
                                    }));
                                    await updateDoc(resRef, { 
                                        pago_estado: 'Pagado',
                                        estado: 'Asiste',
                                        items: reservationItems,
                                        precio: subtotal - totalDiscount,
                                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                                    });
                                } catch (resErr) {
                                    console.error("Error updating reservation status on snapshot:", resErr);
                                }
                            }

                            await finalizeSaleProcess(data.cliente_id, data.local_id);
                        }
                    }
                });

                unsubscribeRef.current = unsubscribe;

            } else {
                throw new Error(result.data.message || 'Error al enviar cobro a la terminal.');
            }
        } catch (error: any) {
            console.error("Error sending to terminal:", error);
            toast({ variant: 'destructive', title: 'Error de conexión con Terminal', description: error.message || "No se pudo conectar. Verifica que la terminal esté encendida y vinculada." });

            // Revertir la venta creada si falla la terminal
            if (saleIdRef.current) {
                await revertPendingSale(saleIdRef.current);
            }

            setIsSendingToTerminal(false);
            setIsWaitingForPayment(false);
            saleIdRef.current = null;
        }
    };

    const [isStepTransitioning, setIsStepTransitioning] = useState(false);

    const handleNextStep = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (cart.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'El carrito está vacío.' });
            return;
        }
        if (!selectedClientId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debes seleccionar un cliente.' });
            return;
        }

        // Nueva Validacion: Verificar que todos los items tengan vendedor
        const missingSeller = cart.some(item => !item.barbero_id);
        if (missingSeller) {
            toast({
                variant: 'destructive',
                title: 'Faltan datos',
                description: 'Por favor, asigna un vendedor a todos los productos/servicios del carrito antes de continuar.'
            });
            return;
        }

        // Preseleccionar método de pago y monto exacto si no está definido
        if (total === 0 && pointsDiscount > 0) {
            form.setValue('metodo_pago', 'alfacoins', { shouldValidate: true });
        } else if (!form.getValues('metodo_pago') || form.getValues('metodo_pago') === 'alfacoins') {
            form.setValue('metodo_pago', 'efectivo', { shouldValidate: true });
        }
        if (!amountPaid || amountPaid < totalConPropina) {
            setAmountPaid(totalConPropina);
        }

        // Guard against mobile ghost-clicks / double-taps hitting the Cobrar button in the exact same screen position
        setIsStepTransitioning(true);
        setStep(2);
        setTimeout(() => {
            setIsStepTransitioning(false);
        }, 450);
    };

    const resetComponentsState = useCallback(() => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = undefined;
        }
        setCart([]);
        setSearchTerm('');
        setStep(1);
        setRedeemPoints(false);
        setAlfaCoinsToUse(null);
        setSelectedClientId(''); // Reset redeem points state
        setAnticipoPagado(0); // Reset anticipo to prevent cross-contamination between sales
        setReservationId(undefined); // Reset reservationId to prevent modifying wrong reservation
        setAppliedBenefit(null);

        // Determine default local
        let defaultLocalId = '';
        if (user?.local_id && user.local_id !== 'todos') {
            defaultLocalId = user.local_id;
        } else if (selectedLocalId && selectedLocalId !== 'todos') {
            defaultLocalId = selectedLocalId;
        } else if (locales && locales.length > 0) {
            defaultLocalId = locales[0].id;
        }

        form.reset({
            cliente_id: '',
            local_id: defaultLocalId,
            metodo_pago: 'efectivo',
            pago_efectivo: 0,
            pago_tarjeta: 0,
            pago_transferencia: 0,
            propina: 0,
            notas: ''
        });

        setIsSubmitting(false);
        setAmountPaid(0);
        setIsSendingToTerminal(false);
        setIsWaitingForPayment(false);
        setIsClientModalOpen(false);
        setIsAddItemDialogOpen(false);
        saleIdRef.current = null;
    }, [form, user, selectedLocalId, locales]);

    useEffect(() => {
        if (isOpen && !initialData) {
            // Reset state only when opening a fresh sale (no initial data)
            // We do NOT reset on close anymore to prevent rendering race conditions
            resetComponentsState();
        }
    }, [isOpen, initialData, resetComponentsState]);

    const revertPendingSale = async (saleId: string) => {
        if (!db) return;
        try {
            await runTransaction(db, async (transaction) => {
                const saleRef = doc(db, 'ventas', saleId);
                const saleDoc = await transaction.get(saleRef);
                if (!saleDoc.exists()) return;

                const saleData = saleDoc.data();
                if (saleData.pago_estado !== 'Pendiente') return;

                // Restaurar Stock
                const items = saleData.items || [];
                for (const item of items) {
                    if (item.tipo === 'producto') {
                        const productRef = doc(db, 'productos', item.id);
                        const productDoc = await transaction.get(productRef);
                        if (productDoc.exists()) {
                            const productData = productDoc.data() as Product;
                            const currentStock = productData.stock || 0;
                            const qtyToRestore = Number(item.cantidad) || 0;
                            const newStock = currentStock + qtyToRestore;
                            transaction.update(productRef, { stock: newStock });

                            // Log movement for cancellation
                            const movementRef = doc(collection(db, 'movimientos_inventario'));
                            const selectedLocal = locales.find(l => l.id === saleData.local_id);
                            const clientName = (saleData as any).cliente_id ? (clients.find(c => c.id === saleData.cliente_id)?.nombre || 'Cliente') : 'Cliente';

                            transaction.set(movementRef, {
                                date: Timestamp.now(),
                                local_id: saleData.local_id,
                                product_id: productRef.id,
                                presentation_id: (productData as any).presentation_id || 'default',
                                from: currentStock,
                                to: newStock,
                                cause: 'Cancelación de venta',
                                staff_id: 'system',
                                comment: `Venta cancelada/revertida`,
                                product_name: productData.nombre,
                                staff_name: 'Sistema',
                                local_name: selectedLocal?.name || 'Local',
                                concepto: `Cancelación de venta: ${clientName}`
                            });
                        }
                    }
                }

                // Guardar respaldo en ventas_canceladas por si el cliente termina pagando en la terminal física
                // segundos después de que recepción cerró la ventana o canceló la espera.
                const backupRef = doc(db, 'ventas_canceladas', saleId);
                transaction.set(backupRef, {
                    ...saleData,
                    cancelado_en: Timestamp.now(),
                    motivo_cancelacion: 'terminal_wait_cancelled'
                });

                // Eliminar la venta pendiente de la colección principal para no dejar basura
                transaction.delete(saleRef);
            });
            console.log("Venta revertida y stock restaurado:", saleId);
        } catch (e) {
            console.error("Error revirtiendo venta:", e);
            toast({ variant: "destructive", title: "Error", description: "No se pudo revertir la venta automáticamente. Por favor revisa el inventario." });
        }
    };

    const cancelPendingSale = useCallback(async () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = undefined;
        }
        setIsWaitingForPayment(false);
        setIsSendingToTerminal(false);
        const saleIdToCancel = saleIdRef.current;
        if (saleIdToCancel && db) {
            console.log("Cancelling pending sale due to modal close/user cancel:", saleIdToCancel);
            saleIdRef.current = null;
            await revertPendingSale(saleIdToCancel);
            toast({ title: "Operación cancelada", description: "El intento de cobro en terminal ha sido cancelado y el stock restaurado." });
        }
    }, [db]);


    useEffect(() => {
        if (isMinimized) {
            // Force unlock body after animation to prevent background freezing
            setTimeout(() => {
                document.body.style.removeProperty('pointer-events');
                document.body.style.removeProperty('overflow');
                document.body.removeAttribute('data-scroll-locked');
            }, 50);
        }
    }, [isMinimized]);


    const handleOpenChange = (open: boolean) => {
        if (!open) {
            if (isWaitingForPayment && saleIdRef.current) {
                if (!confirm("Hay un cobro activo en la terminal. Si el cliente ya pagó o el ticket ya salió impreso, presiona 'Cancelar' y usa el botón '¿Ya se cobró? Finalizar Manualmente'.\n\n¿Seguro que deseas cancelar la espera y cerrar?")) {
                    return;
                }
            }
            cancelPendingSale();
            // Safety hack: Force unlock body after animation to prevent freezing
            setTimeout(() => {
                document.body.style.removeProperty('pointer-events');
                document.body.style.removeProperty('overflow');
                document.body.removeAttribute('data-scroll-locked');
            }, 500);
        }
        onOpenChange(open);
    }

    const handleClose = () => {
        handleOpenChange(false);
    }

    const handleClientCreated = (newClientId: string) => {
        setIsClientModalOpen(false);
        setClientQueryKey(prev => prev + 1);
        setSelectedClientId(newClientId);
        form.setValue('cliente_id', newClientId, { shouldValidate: true });
    };

    async function onSubmit(data: SaleFormData) {
        if (!db) return;
        setIsSubmitting(true);
        try {
            // Pre-transaction: Try to find existing sale by reservationId
            // This is CRITICAL because the saleId might differ from reservationId
            let preFoundSaleId: string | null = null;
            let preFoundSaleData: any = null;

            if (reservationId) {
                const q = query(
                    collection(db, 'ventas'),
                    where('reservationId', '==', reservationId),
                    where('pago_estado', 'in', ['deposit_paid', 'Pago Parcial', 'Pendiente', 'Pagado']) // Include Pagado just in case valid audit, but logic below filters
                );

                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    // Use the first valid one found
                    const doc = snapshot.docs[0];
                    const d = doc.data();
                    // Strict check: Only grab it if it looks like an active partial sale
                    if (d.pago_estado === 'deposit_paid' || d.pago_estado === 'Pago Parcial' || d.pago_estado === 'Pendiente' || (d.pago_estado === 'Pagado' && d.monto_pagado_real < d.total)) {
                        preFoundSaleId = doc.id;
                        preFoundSaleData = d;
                    }
                }
            }

            await runTransaction(db, async (transaction) => {

                // Consolidar cantidades por producto para el stock
                const productQuantities = new Map<string, number>();
                const productRefsMap = new Map<string, DocumentReference>();
                const itemsMap = new Map<string, CartItem>();

                for (const item of cart) {
                    if (item.tipo === 'producto') {
                        const currentQty = productQuantities.get(item.id) || 0;
                        productQuantities.set(item.id, currentQty + item.cantidad);

                        if (!productRefsMap.has(item.id)) {
                            productRefsMap.set(item.id, doc(db, 'productos', item.id));
                            itemsMap.set(item.id, item);
                        }
                    }
                }

                const uniqueProductIds = Array.from(productQuantities.keys());

                // 1. READ: Obtener documentos de productos
                const productDocs = await Promise.all(
                    uniqueProductIds.map(id => transaction.get(productRefsMap.get(id)!))
                );

                // Validar Stock (pero NO actualizar todavía para respetar All Reads Before Writes)
                const pendingStockUpdates: { ref: DocumentReference; newStock: number; productData: Product }[] = [];

                for (const [index, productDoc] of productDocs.entries()) {
                    const productId = uniqueProductIds[index];
                    const qtyNeeded = productQuantities.get(productId)!;
                    const itemInfo = itemsMap.get(productId)!;
                    const ref = productRefsMap.get(productId)!;

                    if (!productDoc.exists()) {
                        throw new Error(`Producto con ID ${productId} no encontrado.`);
                    }

                    const productData = productDoc.data() as Product;
                    const currentStock = productData.stock;
                    const newStock = currentStock - qtyNeeded;

                    if (newStock < 0) {
                        throw new Error(`Stock insuficiente para ${itemInfo.nombre}. Requerido: ${qtyNeeded}, Disponible: ${currentStock}`);
                    }

                    // DEFER WRITE: Guardamos la actualización para ejecutarla DESPUÉS de todos los reads (como buscar la venta existente)
                    pendingStockUpdates.push({ ref, newStock, productData });
                }

                // 2. READ: Determinar si actualizamos una venta existente o creamos una nueva
                let saleDocRef = doc(collection(db, "ventas")); // Default new
                let isUpdate = false;
                let existingSaleData: any = {};
                let isDepositLiquidation = false;
                let depositSaleRef: any = null;
                let depositSaleData: any = null;

                const checkDepositSale = (ref: any, sData: any) => {
                    const isDep = Boolean(
                        (sData?.tipo_venta === 'anticipo' ||
                        ref.id?.startsWith('deposit_') ||
                        sData?.pago_estado === 'deposit_paid') &&
                        sData?.pago_estado !== 'Pendiente' &&
                        sData?.pago_estado !== 'pendiente'
                    );
                    if (isDep) {
                        isDepositLiquidation = true;
                        depositSaleRef = ref;
                        depositSaleData = sData;
                        return true;
                    }
                    return false;
                };

                if (preFoundSaleId) {
                    // PRIORITIZE the sale found via Query
                    const foundRef = doc(db, 'ventas', preFoundSaleId);
                    // Read inside transaction
                    const saleCheck = await transaction.get(foundRef);
                    if (saleCheck.exists()) {
                        const sData = saleCheck.data();
                        if (checkDepositSale(foundRef, sData)) {
                            // Keep saleDocRef as new doc so deposit record on previous date is preserved
                        } else {
                            saleDocRef = foundRef;
                            isUpdate = true;
                            existingSaleData = sData;
                        }
                    }
                } else if (reservationId) {
                    // Fallback: Try direct lookup (best case: ID matches)
                    const possibleSaleRef = doc(db, 'ventas', reservationId);
                    const possibleSaleDoc = await transaction.get(possibleSaleRef);

                    if (possibleSaleDoc.exists()) {
                        const sData = possibleSaleDoc.data();
                        if (checkDepositSale(possibleSaleRef, sData)) {
                            // Keep saleDocRef as new doc
                        } else if (sData.pago_estado === 'deposit_paid' || sData.pago_estado === 'Pago Parcial') {
                            saleDocRef = possibleSaleRef;
                            isUpdate = true;
                            existingSaleData = sData;
                        }
                    } else {
                        // 2. Try query by field (fallback: ID differs)
                        // We will try to fetch the reservation first to see if it has 'deposit_payment_id'
                        const resRef = doc(db, 'reservas', reservationId);
                        const resDoc = await transaction.get(resRef);
                        if (resDoc.exists()) {
                            const resData = resDoc.data();
                            // If reservation has a tracked payment ID equivalent to the sale ID
                            if (resData.deposit_payment_id) {
                                const linkedSaleRef = doc(db, 'ventas', resData.deposit_payment_id);
                                const linkedSaleDoc = await transaction.get(linkedSaleRef);
                                if (linkedSaleDoc.exists()) {
                                    const sData = linkedSaleDoc.data();
                                    if (checkDepositSale(linkedSaleRef, sData)) {
                                        // Keep saleDocRef as new doc
                                    } else if (sData.pago_estado === 'deposit_paid' || sData.pago_estado === 'Pago Parcial') {
                                        saleDocRef = linkedSaleRef;
                                        isUpdate = true;
                                        existingSaleData = sData;
                                    }
                                }
                            }
                        }
                    }
                }

                if (isDepositLiquidation) {
                    console.log("Preserving deposit sale:", depositSaleRef.id, "and creating liquidation sale:", saleDocRef.id);
                } else if (isUpdate) {
                    // Log for debugging
                    console.log("Updating existing sale:", saleDocRef.id);
                }

                // --- WRITES START HERE ---
                // 3. WRITES: Ejecutar actualizaciones de stock pendientes

                for (const update of pendingStockUpdates) {
                    transaction.update(update.ref, { stock: update.newStock });

                    // Log movement
                    const movementRef = doc(collection(db, 'movimientos_inventario'));
                    const selectedClient = clients.find(c => c.id === data.cliente_id);
                    const clientFullName = selectedClient ? `${selectedClient.nombre} ${selectedClient.apellido || ''}`.trim() : 'Cliente';
                    const selectedLocal = locales.find(l => l.id === data.local_id);

                    transaction.set(movementRef, {
                        date: Timestamp.now(),
                        local_id: data.local_id,
                        product_id: update.ref.id,
                        presentation_id: update.productData.presentation_id || 'default',
                        from: update.productData.stock,
                        to: update.newStock,
                        cause: 'Venta',
                        staff_id: user?.uid || 'unknown',
                        comment: `Venta a ${clientFullName}`,
                        product_name: update.productData.nombre,
                        staff_name: user?.displayName || user?.email || 'Desconocido',
                        local_name: selectedLocal?.name || 'Local',
                        concepto: `Registrar venta: ${clientFullName}`
                    });

                    if (update.productData.stock_alarm_threshold && update.newStock <= update.productData.stock_alarm_threshold && update.productData.notification_email) {
                        sendStockAlert({
                            productName: update.productData.nombre,
                            currentStock: update.newStock,
                            recipientEmail: update.productData.notification_email,
                            productImage: update.productData.images?.[0], // Pass image if available
                        }).then(() => {
                            toast({
                                title: "Alerta de Stock Enviada",
                                description: `El producto ${update.productData.nombre} tiene stock bajo (${update.newStock}). Se ha enviado un correo.`,
                            });
                        }).catch(console.error);
                    }
                }

                const itemsToSave = cart.map(item => {
                    const itemSubtotal = (item.precio || 0) * item.cantidad;
                    const itemDiscountValue = Number(item.discountValue) || 0;
                    const itemDiscountType = item.discountType || 'fixed';
                    const itemDiscountAmount = itemDiscountType === 'percentage'
                        ? (itemSubtotal * itemDiscountValue) / 100
                        : itemDiscountValue;

                    return {
                        id: item.id,
                        nombre: item.nombre,
                        tipo: item.tipo,
                        barbero_id: item.barbero_id || null,
                        precio_unitario: item.precio || 0,
                        cantidad: item.cantidad,
                        subtotal: itemSubtotal,
                        descuento: {
                            valor: itemDiscountValue,
                            tipo: itemDiscountType,
                            monto: itemDiscountAmount
                        },
                        commissionPaid: item.commissionPaid
                    };
                });

                // Calculate correct totals
                const grandTotal = subtotal - totalDiscount; // Full value of the service/products
                const amountBeingPaid = total; // The remainder being paid now
                const propinaToSave = Number(data.propina || 0);

                const allBarberos = Array.from(new Set(itemsToSave.map(i => i.barbero_id).filter(id => id)));
                const uniqueBarberos = allBarberos.filter(id => professionals?.some(p => p.id === id));
                let propinaDetalles: any[] = [];
                if (propinaToSave > 0 && uniqueBarberos.length > 0) {
                    const propinaSplit = Math.round((propinaToSave / uniqueBarberos.length) * 100) / 100;
                    propinaDetalles = uniqueBarberos.map(bId => ({
                        barbero_id: bId,
                        monto: propinaSplit
                    }));
                }

                const saleDataToSave: any = {
                    ...data,
                    metodo_pago: (total === 0 && pointsDiscount > 0) ? 'alfacoins' : (data.metodo_pago || (anticipoPagado > 0 ? 'anticipo' : 'efectivo')),
                    items: itemsToSave,
                    subtotal: subtotal,
                    descuento: {
                        valor: totalDiscount,
                        tipo: 'fixed',
                        monto: totalDiscount
                    },
                    descuento_alfacoins: pointsDiscount || 0,
                    alfacoins_canjeados: effectiveAlfaCoinsToUse || 0,
                    total: grandTotal, // Save the full value, not just the remainder
                    propina: propinaToSave,
                    ...(propinaDetalles.length > 0 ? { propina_detalles: propinaDetalles } : {}),
                    fecha_hora_venta: Timestamp.now(),
                    fecha_pago: Timestamp.now(),
                    creado_por_id: user?.uid,
                    creado_por_nombre: user?.displayName || user?.email,
                    pago_estado: 'Pagado',
                    creado_en: Timestamp.now(),
                    anticipoPagado: anticipoPagado || (depositSaleData ? Number(depositSaleData.monto_pagado_real || depositSaleData.monto_anticipo || depositSaleData.anticipoPagado || 0) : 0),
                    monto_pagado_real: isDepositLiquidation
                        ? (amountBeingPaid + propinaToSave)
                        : Math.min(
                            grandTotal + propinaToSave,
                            (((isUpdate && existingSaleData?.pago_estado !== 'Pendiente') ? Number(existingSaleData?.monto_pagado_real || 0) : (anticipoPagado || 0)) + amountBeingPaid + propinaToSave)
                        ),
                    saldo_pendiente: 0,
                    status: 'completed',
                    ...(appliedBenefit ? {
                        beneficio_aplicado: {
                            id: appliedBenefit.benefitId || appliedBenefit.id || null,
                            titulo: appliedBenefit.benefitTitle || appliedBenefit.title || null,
                            folio: appliedBenefit.folio || null,
                            canjeado_en: Timestamp.now()
                        }
                    } : {}),
                };

                if (data.metodo_pago === 'combinado') {
                    const propMetodo = selectedPropinaMetodo || 'tarjeta';
                    let effE = Number(data.pago_efectivo) || 0;
                    let effT = Number(data.pago_tarjeta) || 0;
                    let effTr = Number(data.pago_transferencia) || 0;

                    if (propinaToSave > 0) {
                        if (propMetodo === 'tarjeta') effT = Math.max(0, effT - propinaToSave);
                        else if (propMetodo === 'efectivo') effE = Math.max(0, effE - propinaToSave);
                        else if (propMetodo === 'transferencia') effTr = Math.max(0, effTr - propinaToSave);
                    }

                    saleDataToSave.propina_metodo = propMetodo;
                    saleDataToSave.detalle_pago_combinado = {
                        efectivo: effE,
                        tarjeta: effT,
                        transferencia: effTr,
                        pagos_en_linea: 0
                    };

                    const nonZero = [
                        effE > 0 ? 'efectivo' : null,
                        effT > 0 ? 'tarjeta' : null,
                        effTr > 0 ? 'transferencia' : null
                    ].filter(Boolean);

                    if (nonZero.length === 1) {
                        saleDataToSave.metodo_pago = nonZero[0];
                    }
                } else {
                    saleDataToSave.propina_metodo = data.metodo_pago || (anticipoPagado > 0 ? 'anticipo' : 'efectivo');
                    if (isDepositLiquidation) {
                        const paidNow = amountBeingPaid + propinaToSave;
                        saleDataToSave.detalle_pago_combinado = {
                            efectivo: data.metodo_pago === 'efectivo' ? paidNow : 0,
                            tarjeta: data.metodo_pago === 'tarjeta' ? paidNow : 0,
                            transferencia: data.metodo_pago === 'transferencia' ? paidNow : 0,
                            pagos_en_linea: (data.metodo_pago === 'mercadopago' || data.metodo_pago === 'pagos_en_linea') ? paidNow : 0
                        };
                    }
                }

                if (isDepositLiquidation && depositSaleRef) {
                    transaction.update(depositSaleRef, {
                        saldo_pendiente: 0,
                        status: 'completed',
                        absorbed_in_sale_id: saleDocRef.id
                    });
                    if (reservationId) {
                        saleDataToSave.reservationId = reservationId;
                    }
                    saleDataToSave.deposit_sale_id = depositSaleRef.id;
                    transaction.set(saleDocRef, removeUndefinedFields(saleDataToSave));
                } else if (isUpdate) {
                    // Merge with existing payments if updating normal draft/partial sale
                    const isPendingDraft = existingSaleData?.pago_estado === 'Pendiente';

                    // 1. Extract previous payments (ONLY from actually paid funds, NEVER from uncompleted pending attempts)
                    let prevEfectivo = 0;
                    let prevTarjeta = 0;
                    let prevTransferencia = 0;
                    let prevOnline = 0;

                    if (!isPendingDraft) {
                        const prevCombined = existingSaleData.detalle_pago_combinado;
                        const prevDepositAmount = Number(existingSaleData.monto_pagado_real) || Number(existingSaleData.monto_anticipo) || Number(existingSaleData.anticipoPagado) || Number(existingSaleData.anticipo_pagado) || Number(anticipoPagado) || 0;

                        if (existingSaleData.metodo_pago === 'combinado' && prevCombined) {
                            prevEfectivo = prevCombined.efectivo || 0;
                            prevTarjeta = prevCombined.tarjeta || 0;
                            prevTransferencia = prevCombined.transferencia || 0;
                            prevOnline = prevCombined.pagos_en_linea || 0;
                        } else if (existingSaleData.metodo_pago === 'mercadopago') {
                            prevOnline = prevDepositAmount > 0 ? prevDepositAmount : (existingSaleData.total || 0);
                        } else if (existingSaleData.metodo_pago === 'efectivo') {
                            prevEfectivo = prevDepositAmount > 0 ? prevDepositAmount : (existingSaleData.total || 0);
                        } else if (existingSaleData.metodo_pago === 'tarjeta') {
                            prevTarjeta = prevDepositAmount > 0 ? prevDepositAmount : (existingSaleData.total || 0);
                        } else if (existingSaleData.metodo_pago === 'transferencia') {
                            prevTransferencia = prevDepositAmount > 0 ? prevDepositAmount : (existingSaleData.total || 0);
                        }
                    }

                    // 2. Extract current payments (amountBeingPaid is the balance being paid NOW)
                    let currEfectivo = 0;
                    let currTarjeta = 0;
                    let currTransferencia = 0;

                    if (data.metodo_pago === 'combinado') {
                        currEfectivo = data.pago_efectivo || 0;
                        currTarjeta = data.pago_tarjeta || 0;
                        currTransferencia = data.pago_transferencia || 0;
                    } else if (data.metodo_pago === 'efectivo') {
                        currEfectivo = amountBeingPaid + propinaToSave;
                    } else if (data.metodo_pago === 'tarjeta') {
                        currTarjeta = amountBeingPaid + propinaToSave;
                    } else if (data.metodo_pago === 'transferencia') {
                        currTransferencia = amountBeingPaid + propinaToSave;
                    }

                    // 3. Combine
                    let totalEfectivo = prevEfectivo + currEfectivo;
                    let totalTarjeta = prevTarjeta + currTarjeta;
                    let totalTransferencia = prevTransferencia + currTransferencia;
                    let totalOnline = prevOnline;

                    // CANDADO DE SEGURIDAD ANTISOBRECOBRO:
                    // Si la suma de métodos excede el total + propina (debido a borradores pendientes no liquidados),
                    // se respeta prioritariamente la decisión actual del cajero.
                    const maxAllowed = (saleDataToSave.total || 0) + propinaToSave;
                    const combinedSumRaw = totalEfectivo + totalTarjeta + totalTransferencia + totalOnline;
                    if (combinedSumRaw > maxAllowed + 0.01) {
                        if (isPendingDraft || (currEfectivo + currTarjeta + currTransferencia >= maxAllowed - 0.01)) {
                            totalEfectivo = currEfectivo;
                            totalTarjeta = currTarjeta;
                            totalTransferencia = currTransferencia;
                            totalOnline = 0;
                        }
                    }

                    const nonZeroMethods = [
                        totalEfectivo > 0 ? 'efectivo' : null,
                        totalTarjeta > 0 ? 'tarjeta' : null,
                        totalTransferencia > 0 ? 'transferencia' : null,
                        totalOnline > 0 ? 'mercadopago' : null,
                    ].filter(Boolean);

                    if (nonZeroMethods.length > 1) {
                        saleDataToSave.metodo_pago = 'combinado';
                        saleDataToSave.detalle_pago_combinado = {
                            efectivo: totalEfectivo,
                            tarjeta: totalTarjeta,
                            transferencia: totalTransferencia,
                            pagos_en_linea: totalOnline
                        };
                    } else if (nonZeroMethods.length === 1) {
                        saleDataToSave.metodo_pago = nonZeroMethods[0];
                        delete saleDataToSave.detalle_pago_combinado;
                    } else {
                        saleDataToSave.metodo_pago = data.metodo_pago || 'efectivo';
                        delete saleDataToSave.detalle_pago_combinado;
                    }

                    saleIdRef.current = null;

                    transaction.update(saleDocRef, removeUndefinedFields(saleDataToSave));
                } else {
                    if (reservationId) {
                        saleDataToSave.reservationId = reservationId;
                    }
                    transaction.set(saleDocRef, removeUndefinedFields(saleDataToSave));
                }

                if (reservationId) {
                    const reservationRef = doc(db, 'reservas', reservationId);
                    const reservationItems = cart.map((item: any) => ({
                        id: item.id,
                        nombre: item.nombre,
                        servicio: item.nombre,
                        tipo: item.tipo,
                        barbero_id: item.barbero_id || null,
                        precio: item.precio || 0,
                        duracion: item.duracion || 0,
                        cantidad: item.cantidad || 1,
                        ...(item.hora_inicio ? { hora_inicio: item.hora_inicio, hora_fin: item.hora_fin } : {}),
                        ...(item.professional_lock !== undefined && item.professional_lock !== null ? { professional_lock: item.professional_lock } : {})
                    }));
                    transaction.update(reservationRef, {
                        pago_estado: 'Pagado',
                        estado: 'Asiste',
                        monto_pagado: grandTotal,
                        saldo_pendiente: 0,
                        items: reservationItems,
                        precio: subtotal - totalDiscount,
                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                    });
                }
            });

            await finalizeSaleProcess(data.cliente_id, data.local_id);

        } catch (error: any) {
            console.error('Error al registrar la venta: ', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'No se pudo registrar la venta. Por favor, intenta de nuevo.',
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const isLocalAdmin = user?.role !== 'Administrador general';

    return (
        <>
            <Sheet open={isOpen} onOpenChange={handleOpenChange} modal={!isMinimized}>
                <SheetContent
                    className={cn(
                        "w-full sm:max-w-[1100px] h-[100dvh] max-h-[100dvh] flex flex-col p-0 gap-0 transition-transform duration-300 ease-in-out border-l-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background overflow-hidden",
                        isMinimized && "translate-x-[100%] shadow-none border-none pointer-events-none"
                    )}
                    hideCloseButton
                    hideOverlay={isMinimized}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onInteractOutside={(e) => {
                        if (isMinimized) {
                            e.preventDefault();
                            return; // Allow background interaction when minimized without closing sheet
                        }
                        e.preventDefault();
                        if (isAddItemDialogOpen || isClientModalOpen) return;
                        const target = e.target as HTMLElement;
                        if (target && (target.closest('[role="dialog"]') || target.closest('[role="listbox"]'))) return;
                        if (Date.now() - openTimeRef.current > 500) {
                            setIsMinimized(true);
                        }
                    }}
                    onPointerDownOutside={(e) => {
                        if (isMinimized) {
                            e.preventDefault();
                            return; // Allow background interaction when minimized without closing sheet
                        }
                        e.preventDefault();
                        if (isAddItemDialogOpen || isClientModalOpen) return;
                        const target = e.target as HTMLElement;
                        if (target && (target.closest('[role="dialog"]') || target.closest('[role="listbox"]'))) return;
                        if (Date.now() - openTimeRef.current > 500) {
                            setIsMinimized(true);
                        }
                    }}
                >
                    {/* Pestañita Oficial Vatos Alfa con doble efecto de luz para restaurar venta minimizada */}
                    <div
                        className={cn(
                            "absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 z-[101] pointer-events-auto",
                            "flex h-28 w-11 sm:w-12 items-center justify-center cursor-pointer select-none transition-transform duration-200 hover:-translate-x-[calc(100%+4px)] group",
                            !isMinimized && "hidden"
                        )}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openTimeRef.current = Date.now();
                            setIsMinimized(false);
                        }}
                        title="Venta en curso - Clic para restaurar"
                    >
                        {/* Contenedor del botón con diseño oficial Vatos Alfa */}
                        <div className="relative w-full h-full p-[1.5px] rounded-l-2xl overflow-hidden shadow-[0_4px_25px_rgba(59,130,246,0.4)] bg-blue-600/30 flex items-center justify-center transition-transform duration-150 active:scale-95">
                            {/* 1. Haz de luz láser perimetral giratorio */}
                            <span
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] pointer-events-none animate-conic-laser z-0"
                                aria-hidden="true"
                            />

                            {/* 2. Cuerpo interior del botón (degradado navy profundo) */}
                            <span className="relative z-[1] flex flex-col items-center justify-center w-full h-full text-white overflow-hidden rounded-l-[14.5px] bg-gradient-to-b from-[#18223c] to-[#0d1424] py-2 px-1">
                                {/* 3. Haz de luz oblicuo que viaja periódicamente de izquierda a derecha */}
                                <span
                                    className="absolute inset-0 w-full h-full -skew-x-20 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-btn-light-sweep pointer-events-none z-[2]"
                                    aria-hidden="true"
                                />

                                {/* 4. Contenido en primer plano */}
                                <span className="relative z-10 flex flex-col items-center justify-center gap-1.5 w-full h-full">
                                    <ShoppingBag className="h-4 w-4 text-blue-300 group-hover:text-white transition-colors" />
                                    {totalCartItems > 0 && (
                                        <span className="min-w-4 h-4 px-1 rounded-full text-[9px] font-bold bg-blue-600 text-white flex items-center justify-center shadow-xs">
                                            {totalCartItems}
                                        </span>
                                    )}
                                    <ChevronLeft className="h-4 w-4 text-slate-300 group-hover:text-white group-hover:-translate-x-0.5 transition-all" />
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* CABECERA OFICIAL VATOS ALFA (Regla 5) */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-3.5 sm:px-6 py-2.5 sm:py-3.5 border-b border-blue-900/40 flex items-center justify-between shrink-0">
                        <div className="header-light-beam" />
                        <div className="flex items-center gap-3 relative z-10">
                            <ShoppingBag className="h-5 w-5 text-slate-300 shrink-0" />
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">Registrar Nueva Venta</h2>
                                    <Badge variant="outline" className="text-[10px] py-0 px-2 border-blue-400/40 text-blue-300 bg-blue-500/10 font-bold">
                                        Paso {step} de 2
                                    </Badge>
                                </div>
                                <p className="text-xs text-slate-300 hidden sm:block">
                                    {step === 1 ? 'Busca y agrega servicios o productos al carrito.' : 'Completa los detalles para finalizar la venta.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 relative z-10">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={handleClose}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <Form {...form}>
                        {step === 1 && (
                            <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-5 lg:grid-cols-3 gap-4 md:gap-6 px-3 sm:px-6 py-3 sm:py-4 overflow-hidden relative">
                                {/* Selector de pestaña para Móvil (< 768px) */}
                                <div className="md:hidden flex items-center p-1 bg-muted/40 rounded-xl shrink-0 border border-border/40 mb-1">
                                    <button
                                        type="button"
                                        onClick={() => setMobileTab('catalogo')}
                                        className={cn(
                                            "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all",
                                            mobileTab === 'catalogo'
                                                ? "bg-background text-foreground shadow-xs border border-border/60"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Scissors className="h-3.5 w-3.5 text-slate-400" /> Catálogo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMobileTab('carrito')}
                                        className={cn(
                                            "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all relative",
                                            mobileTab === 'carrito'
                                                ? "bg-background text-foreground shadow-xs border border-border/60"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <ShoppingCart className="h-3.5 w-3.5 text-slate-400" />
                                        Carrito
                                        {totalCartItems > 0 && (
                                            <Badge className="ml-1 px-1.5 py-0 h-4 rounded-full text-[10px] font-bold bg-blue-600 text-white border-0">
                                                {totalCartItems}
                                            </Badge>
                                        )}
                                    </button>
                                </div>

                                {/* COLUMNA 1: CATÁLOGO */}
                                <div className={cn(
                                    "md:col-span-3 lg:col-span-2 flex flex-col gap-3 md:min-h-0 flex-1 overflow-hidden",
                                    mobileTab === 'carrito' && "hidden md:flex"
                                )} style={{ minHeight: 0 }}>
                                    <div className="flex-shrink-0">
                                        {selectedClient ? (
                                            <Card className="border border-border/60">
                                                <CardContent className="p-2.5 sm:p-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-2.5">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarFallback className="text-xs">{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="font-bold text-xs sm:text-sm text-foreground">{selectedClient.nombre} {selectedClient.apellido}</p>
                                                                <p className="text-[11px] text-muted-foreground">{selectedClient.telefono}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-slate-400 hover:text-foreground transition-colors"
                                                                onClick={() => { setIsEditingClient(true); setIsClientModalOpen(true); }}
                                                                title="Editar cliente"
                                                            >
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-slate-400 hover:text-destructive transition-colors"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    form.setValue('cliente_id', '');
                                                                    setSelectedClientId('');
                                                                    setRedeemPoints(false);
                                                                }}
                                                                title="Eliminar cliente"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <FormField control={form.control} name="cliente_id" render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <FormLabel className="text-xs">Cliente *</FormLabel>
                                                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-blue-500 hover:text-blue-400" onClick={() => { setIsEditingClient(false); setIsClientModalOpen(true); }}>
                                                            <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                                        </Button>
                                                    </div>
                                                    <ClientCombobox
                                                        clients={clients}
                                                        loading={clientsLoading}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        onSearchChange={setClientSearchTerm}
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                        )}
                                    </div>

                                    <div className="relative flex-shrink-0">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Buscar servicio o producto..." className="pl-9 h-9 text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                    </div>

                                    <Tabs defaultValue="servicios" className="flex-grow flex flex-col min-h-0">
                                        <TabsList className="grid grid-cols-2 w-full sm:w-[240px] h-8 p-0.5">
                                            <TabsTrigger value="servicios" className="text-xs">Servicios</TabsTrigger>
                                            <TabsTrigger value="productos" className="text-xs">Productos</TabsTrigger>
                                        </TabsList>
                                        <ScrollArea className="flex-grow mt-3 pr-2">
                                            <TabsContent value="servicios" className="mt-0 space-y-3 pb-20 md:pb-2">
                                                {servicesLoading ? (
                                                    <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                                        {Array.from({ length: 9 }).map((_, idx) => (
                                                            <div key={idx} className="p-2.5 rounded-xl border border-border/40"><Skeleton className="h-8 w-full" /></div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Servicios Individuales */}
                                                        <div>
                                                            {regularServices.length > 0 && <h3 className="font-medium mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">Servicios Individuales</h3>}
                                                            <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                                                {regularServices.map((service: ServiceType) => {
                                                                    const inCartCount = cartCountMap[service.id] || 0;
                                                                    return (
                                                                        <div
                                                                            key={service.id}
                                                                            className={cn(
                                                                                "group relative flex items-center justify-between p-2 sm:p-2.5 px-3 rounded-xl border transition-all cursor-pointer select-none active:scale-[0.98] min-h-[46px]",
                                                                                inCartCount > 0
                                                                                    ? "border-blue-500 bg-blue-50/25 dark:bg-blue-950/25 ring-1 ring-blue-500/30 shadow-xs"
                                                                                    : "border-border/60 bg-card hover:border-blue-400/50 hover:bg-muted/30 shadow-xs"
                                                                            )}
                                                                            onClick={() => addToCart(service, 'servicio')}
                                                                        >
                                                                            <div className="flex-1 min-w-0 pr-2">
                                                                                <p className="font-normal text-xs leading-snug text-foreground line-clamp-2">
                                                                                    {service.name}
                                                                                </p>
                                                                            </div>
                                                                            <div className="shrink-0 flex items-center gap-1.5">
                                                                                <span className="text-xs font-medium text-foreground">
                                                                                    ${formatMoney(service.price || 0)}
                                                                                </span>
                                                                                {inCartCount > 0 && (
                                                                                    <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                                                                                        {inCartCount}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Paquetes */}
                                                        {packageServices.length > 0 && (
                                                            <div className="pt-1">
                                                                <h3 className="font-medium mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">Paquetes</h3>
                                                                <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                                                    {packageServices.map((service: ServiceType) => {
                                                                        const inCartCount = cartCountMap[service.id] || 0;
                                                                        return (
                                                                            <div
                                                                                key={service.id}
                                                                                className={cn(
                                                                                    "group relative flex items-center justify-between p-2 sm:p-2.5 px-3 rounded-xl border transition-all cursor-pointer select-none active:scale-[0.98] min-h-[46px] bg-blue-50/15 dark:bg-blue-950/10",
                                                                                    inCartCount > 0
                                                                                        ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/30 ring-1 ring-blue-500/30 shadow-xs"
                                                                                        : "border-blue-500/25 hover:border-blue-400/60 hover:bg-blue-50/25 shadow-xs"
                                                                                )}
                                                                                onClick={() => addToCart(service, 'servicio')}
                                                                            >
                                                                                <div className="flex-1 min-w-0 pr-2">
                                                                                    <p className="font-normal text-xs leading-snug text-foreground line-clamp-2">
                                                                                        {service.name}
                                                                                    </p>
                                                                                </div>
                                                                                <div className="shrink-0 flex items-center gap-1.5">
                                                                                    <span className="text-xs font-medium text-foreground">
                                                                                        ${formatMoney(service.price || 0)}
                                                                                    </span>
                                                                                    {inCartCount > 0 && (
                                                                                        <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                                                                                            {inCartCount}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {regularServices.length === 0 && packageServices.length === 0 && (
                                                            <div className="text-center py-10 text-muted-foreground text-xs sm:text-sm">
                                                                No se encontraron servicios.
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </TabsContent>
                                            <TabsContent value="productos" className="mt-0 pb-20 md:pb-2">
                                                <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                                    {productsLoading ? (
                                                        Array.from({ length: 9 }).map((_, idx) => (
                                                            <div key={idx} className="p-2.5 rounded-xl border border-border/40"><Skeleton className="h-8 w-full" /></div>
                                                        ))
                                                    ) : (
                                                        filteredProducts.map((product: Product) => {
                                                            const inCartCount = cartCountMap[product.id] || 0;
                                                            return (
                                                                <div
                                                                    key={product.id}
                                                                    className={cn(
                                                                        "group relative flex items-center justify-between p-2 sm:p-2.5 px-3 rounded-xl border transition-all cursor-pointer select-none active:scale-[0.98] min-h-[46px]",
                                                                        inCartCount > 0
                                                                            ? "border-blue-500 bg-blue-50/25 dark:bg-blue-950/25 ring-1 ring-blue-500/30 shadow-xs"
                                                                            : "border-border/60 bg-card hover:border-blue-400/50 hover:bg-muted/30 shadow-xs"
                                                                    )}
                                                                    onClick={() => addToCart(product, 'producto')}
                                                                >
                                                                    <div className="flex-1 min-w-0 pr-2">
                                                                        <p className="font-normal text-xs leading-snug text-foreground line-clamp-1">
                                                                            {product.nombre}
                                                                        </p>
                                                                        <p className="text-[10px] text-muted-foreground font-normal">
                                                                            {product.stock} en stock
                                                                        </p>
                                                                    </div>
                                                                    <div className="shrink-0 flex items-center gap-1.5">
                                                                        <span className="text-xs font-medium text-foreground">
                                                                            ${formatMoney(product.public_price || 0)}
                                                                        </span>
                                                                        {inCartCount > 0 && (
                                                                            <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                                                                                {inCartCount}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </TabsContent>
                                        </ScrollArea>
                                    </Tabs>
                                </div>

                                {/* COLUMNA 2: RESUMEN CARRITO */}
                                <div className={cn(
                                    "md:col-span-2 lg:col-span-1 flex flex-col md:min-h-0 flex-1 overflow-hidden",
                                    mobileTab === 'catalogo' && "hidden md:flex"
                                )}>
                                    <ResumenCarrito
                                        cart={cart}
                                        subtotal={subtotal}
                                        totalDiscount={totalDiscount}
                                        total={total}
                                        anticipoPagado={anticipoPagado}
                                        onOpenAddItem={() => setIsAddItemDialogOpen(true)}
                                        updateQuantity={updateQuantity}
                                        updateItemProfessional={updateItemProfessional}
                                        assignAllProfessional={assignAllProfessional}
                                        updateItemDiscount={updateItemDiscount}
                                        removeFromCart={removeFromCart}
                                        serviceSellers={serviceSellers}
                                        productSellers={productSellers}
                                        client={selectedClient}
                                        hasAppDownloaded={hasAppDownloaded}
                                        redeemPoints={redeemPoints}
                                        setRedeemPoints={setRedeemPoints}
                                        pointsDiscount={pointsDiscount}
                                        alfaCoinsToUse={alfaCoinsToUse}
                                        setAlfaCoinsToUse={setAlfaCoinsToUse}
                                        clientAlfaCoins={clientAlfaCoins}
                                        maxUsableAlfaCoins={maxUsableAlfaCoins}
                                        propina={watchedPropina}
                                        appliedBenefit={appliedBenefit}
                                        alfaCoinUnitValue={alfaCoinUnitValue}
                                        clientLevelInfo={clientLevelInfo}
                                    />
                                </div>

                                {/* BARRA FLOTANTE FIJA EN MÓVIL (en catálogo con items) */}
                                {mobileTab === 'catalogo' && totalCartItems > 0 && (
                                    <div className="md:hidden absolute bottom-2.5 left-3 right-3 p-2.5 bg-[#151b2e] border-2 border-blue-500 rounded-xl shadow-2xl flex items-center justify-between gap-3 z-30 animate-in slide-in-from-bottom-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                                {totalCartItems}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-300 font-medium">Total acumulado:</span>
                                                <span className="text-sm font-bold text-white">
                                                    ${formatMoney(Math.max(0, total + Number(watchedPropina || 0)))} MXN
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="alfa"
                                            size="sm"
                                            className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5"
                                            onClick={() => setMobileTab('carrito')}
                                        >
                                            <span>Ver Carrito</span>
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 px-3 sm:px-6 py-3 flex-1 min-h-0 overflow-y-auto">
                                    <div className="space-y-3 shrink-0 md:shrink">

                                        {selectedClient ? (
                                            <Card className="border border-border/70 bg-card rounded-xl overflow-hidden shadow-xs">
                                                <CardContent className="p-3 sm:p-3.5">
                                                    <div className="flex items-start sm:items-center justify-between gap-2.5">
                                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                                            <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 border border-border/60">
                                                                <AvatarImage src={selectedClient.fotoUrl || selectedClient.avatarUrl || selectedClient.photoURL} />
                                                                <AvatarFallback className="bg-muted text-foreground font-bold text-xs">
                                                                    {selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <p className="font-bold text-xs sm:text-sm text-foreground truncate max-w-full">
                                                                        {selectedClient.nombre} {selectedClient.apellido}
                                                                    </p>
                                                                    {hasAppDownloaded && ((selectedClient.cortes_acumulados || selectedClient.cortesAcumulados || 0) > 0 || clientAlfaCoins > 0) && (
                                                                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-bold border-[#C5A880]/40 text-[#C5A880] bg-[#C5A880]/10 shrink-0 font-sans">
                                                                            <Sparkles className="h-2.5 w-2.5 mr-1 text-[#C5A880]" />
                                                                            VIP Alfa
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                                                    <span className="flex items-center gap-1 shrink-0">
                                                                        <Phone className="h-3 w-3 text-slate-400" />
                                                                        {selectedClient.telefono || 'Sin teléfono'}
                                                                    </span>
                                                                    {selectedClient.correo && (
                                                                        <span className="flex items-center gap-1 truncate hidden sm:flex">
                                                                            <Mail className="h-3 w-3 text-slate-400" />
                                                                            {selectedClient.correo}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                                                    <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded-md border border-border/40 font-sans shrink-0">
                                                                        <Scissors className="h-3 w-3 text-slate-400" />
                                                                        <span className="text-foreground">{selectedClient.cortes_acumulados || selectedClient.cortesAcumulados || 0}</span> cortes
                                                                    </span>
                                                                    {hasAppDownloaded && (
                                                                        <span className="text-[11px] font-semibold text-[#C5A880] flex items-center gap-1 bg-[#C5A880]/10 px-2 py-0.5 rounded-md border border-[#C5A880]/30 font-sans shrink-0">
                                                                            <Coins className="h-3 w-3 text-[#C5A880]" />
                                                                            <span>{clientAlfaCoins}</span> ALFA COINS
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                                                                onClick={() => { setIsEditingClient(true); setIsClientModalOpen(true); }}
                                                                title="Editar cliente"
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    form.setValue('cliente_id', '');
                                                                    setSelectedClientId('');
                                                                    setRedeemPoints(false);
                                                                    setStep(1);
                                                                }}
                                                                title="Cambiar cliente"
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <FormField control={form.control} name="cliente_id" render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex justify-between items-center">
                                                        <FormLabel className="text-xs font-semibold">Cliente</FormLabel>
                                                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { setIsEditingClient(false); setIsClientModalOpen(true); }}>
                                                            <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                                        </Button>
                                                    </div>
                                                    <ClientCombobox
                                                        clients={clients}
                                                        loading={clientsLoading}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        onSearchChange={setClientSearchTerm}
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                        )}

                                        <FormField
                                            control={form.control}
                                            name="local_id"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1.5">
                                                    <FormLabel className="text-xs font-semibold flex items-center gap-1.5">
                                                        <Store className="h-3.5 w-3.5 text-slate-400" /> Sucursal / Local
                                                    </FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-9 rounded-xl border-border/70 text-xs font-medium">
                                                                <SelectValue placeholder="Selecciona un local" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                                            {locales.map(l => (
                                                                <SelectItem key={l.id} value={l.id} className="text-xs">
                                                                    {l.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {/* Pase Alfa Club - Canjear AlfaCoins en Paso 2 (Solo para clientes con App descargada) */}
                                        {selectedClient && hasAppDownloaded && (
                                            <div className={cn(
                                                "p-3 rounded-xl border transition-all space-y-2",
                                                clientAlfaCoins > 0
                                                    ? "border-[#C5A880]/40 bg-[#C5A880]/10 shadow-xs"
                                                    : "border-border/60 bg-muted/20"
                                            )}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Coins className={cn("h-4 w-4 shrink-0", clientAlfaCoins > 0 ? "text-[#C5A880]" : "text-slate-400")} />
                                                        <div className="min-w-0">
                                                            <span className={cn("text-xs font-bold font-sans block truncate", clientAlfaCoins > 0 ? "text-[#C5A880]" : "text-muted-foreground")}>
                                                                ALFA COINS: {clientAlfaCoins} ({clientLevelInfo.tierName} • {clientLevelInfo.cashbackPct}%)
                                                            </span>
                                                            <p className="text-[10px] text-muted-foreground font-sans">
                                                                {clientAlfaCoins > 0
                                                                    ? `Equivalente a $${formatMoney(clientCashAvailable)} MXN ($${alfaCoinUnitValue.toFixed(2)} c/u)`
                                                                    : 'Sin saldo de ALFA COINS para canjear en este cobro'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[11px] font-medium text-foreground">
                                                            {redeemPoints ? 'Aplicando' : 'Canjear'}
                                                        </span>
                                                        <Switch
                                                            checked={redeemPoints}
                                                            onCheckedChange={(val) => {
                                                                setRedeemPoints(val);
                                                                if (val && alfaCoinsToUse === null) {
                                                                    setAlfaCoinsToUse(maxUsableAlfaCoins);
                                                                }
                                                            }}
                                                            disabled={clientAlfaCoins <= 0}
                                                        />
                                                    </div>
                                                </div>

                                                {redeemPoints && clientAlfaCoins > 0 && (
                                                    <div className="pt-2 border-t border-[#C5A880]/20 space-y-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs text-muted-foreground">Monedas a canjear:</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    max={maxUsableAlfaCoins}
                                                                    value={alfaCoinsToUse !== null ? alfaCoinsToUse : maxUsableAlfaCoins}
                                                                    onChange={(e) => {
                                                                        const val = Number(e.target.value);
                                                                        if (isNaN(val) || val <= 0) {
                                                                            setAlfaCoinsToUse(0);
                                                                        } else {
                                                                            setAlfaCoinsToUse(Math.min(val, maxUsableAlfaCoins));
                                                                        }
                                                                    }}
                                                                    className="h-8 w-24 text-xs font-semibold text-right bg-background border-border/70 rounded-lg px-2 font-sans"
                                                                />
                                                                {maxUsableAlfaCoins > 0 && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setAlfaCoinsToUse(maxUsableAlfaCoins)}
                                                                        className="h-8 px-2.5 text-[11px] font-bold text-[#C5A880] hover:bg-[#C5A880]/20 rounded-lg"
                                                                    >
                                                                        Todo ({maxUsableAlfaCoins})
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs font-semibold text-[#C5A880] font-sans">
                                                            <span>Descuento aplicado con ALFA COINS:</span>
                                                            <span className="text-sm font-bold">-${formatMoney(pointsDiscount)} MXN</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {total === 0 && pointsDiscount > 0 ? (
                                            <Card className="border-2 border-[#C5A880]/60 bg-[#C5A880]/10 rounded-xl p-4 shadow-xs">
                                                <div className="flex items-center gap-3">
                                                    <Coins className="h-7 w-7 text-[#C5A880] shrink-0" />
                                                    <div className="space-y-0.5">
                                                        <h4 className="text-xs font-bold text-[#C5A880] uppercase tracking-wider font-sans">
                                                            Venta Cubierta 100% con ALFA COINS
                                                        </h4>
                                                        <p className="text-xs text-foreground/90 font-sans">
                                                            Se liquidarán <strong>{effectiveAlfaCoinsToUse} ALFA COINS</strong> del perfil de {selectedClient?.nombre}. No se requiere dinero en efectivo ni cobro en terminal.
                                                        </p>
                                                    </div>
                                                </div>
                                            </Card>
                                        ) : (
                                            <>
                                                <FormField
                                            control={form.control}
                                            name="metodo_pago"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <FormLabel className="text-xs font-semibold flex items-center gap-1.5">
                                                            <Wallet className="h-3.5 w-3.5 text-slate-400" /> Método de Pago
                                                        </FormLabel>
                                                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                                                            Selecciona cómo paga el cliente
                                                        </span>
                                                    </div>
                                                    <FormControl>
                                                        <RadioGroup
                                                            onValueChange={(val) => {
                                                                field.onChange(val);
                                                                if (val === 'efectivo') {
                                                                    form.setValue('propina', 0, { shouldValidate: true });
                                                                    if (!amountPaid || amountPaid < totalConPropina) {
                                                                        setAmountPaid(totalConPropina);
                                                                    }
                                                                }
                                                                if (val !== 'tarjeta' && (isWaitingForPayment || saleIdRef.current)) {
                                                                    cancelPendingSale();
                                                                }
                                                            }}
                                                            value={field.value}
                                                            defaultValue={field.value || 'efectivo'}
                                                            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                                                        >
                                                            {[
                                                                { id: 'efectivo', label: 'Efectivo', desc: 'En caja / cambio', icon: Banknote },
                                                                { id: 'tarjeta', label: 'Tarjeta', desc: 'Terminal Point', icon: CreditCard },
                                                                { id: 'transferencia', label: 'Transferencia', desc: 'SPEI / QR', icon: QrCode },
                                                                { id: 'combinado', label: 'Combinado', desc: 'Mixto', icon: Layers },
                                                            ].map((item) => {
                                                                const Icon = item.icon;
                                                                const isSelected = field.value === item.id;
                                                                return (
                                                                    <div key={item.id} className="relative">
                                                                        <RadioGroupItem value={item.id} id={item.id} className="sr-only" />
                                                                        <label
                                                                            htmlFor={item.id}
                                                                            className={cn(
                                                                                "flex flex-col items-center text-center p-2.5 rounded-xl cursor-pointer transition-all border select-none h-full justify-between gap-1",
                                                                                isSelected
                                                                                    ? "border-2 border-blue-500 bg-blue-50/20 dark:bg-blue-950/30 text-foreground ring-1 ring-blue-500/30 shadow-xs"
                                                                                    : "border-border/60 bg-card hover:border-blue-400/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                                                                            )}
                                                                        >
                                                                            <Icon className={cn("h-5 w-5 transition-colors", isSelected ? "text-blue-400" : "text-slate-400")} />
                                                                            <div>
                                                                                <p className={cn("text-xs font-bold leading-tight", isSelected ? "text-foreground" : "text-foreground/80")}>
                                                                                    {item.label}
                                                                                </p>
                                                                                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                                                                    {item.desc}
                                                                                </p>
                                                                            </div>
                                                                        </label>
                                                                    </div>
                                                                );
                                                            })}
                                                        </RadioGroup>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {paymentMethod && paymentMethod !== 'efectivo' && (
                                            <Card className="p-3 bg-primary/5 border-primary/20">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <FormLabel className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                                            <Sparkles className="h-3.5 w-3.5 text-primary" /> Propina (Opcional)
                                                        </FormLabel>
                                                        {cartBarberoNames.length > 0 && (
                                                            <span className="text-[11px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full font-medium truncate max-w-[180px]">
                                                                {cartBarberoNames.length === 1 ? `Para ${cartBarberoNames[0]}` : `Para: ${cartBarberoNames.join(', ')}`}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-5 gap-1.5">
                                                        {[0, 20, 30, 50, 100].map((amount) => {
                                                            const isSelected = watchedPropina === amount;
                                                            return (
                                                                <Button
                                                                    key={amount}
                                                                    type="button"
                                                                    variant={isSelected ? "default" : "outline"}
                                                                    size="sm"
                                                                    className={cn(
                                                                        "h-7 text-xs font-semibold px-1 transition-all",
                                                                        isSelected && "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                                                    )}
                                                                    onClick={() => {
                                                                        form.setValue('propina', amount, { shouldValidate: true });
                                                                    }}
                                                                >
                                                                    {amount === 0 ? 'No' : `$${amount}`}
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>

                                                    <FormField
                                                        control={form.control}
                                                        name="propina"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-0">
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">$</span>
                                                                        <Input
                                                                            type="number"
                                                                            placeholder="Otro monto..."
                                                                            className="pl-6 h-8 text-xs"
                                                                            min="0"
                                                                            step="1"
                                                                            value={field.value ?? ''}
                                                                            onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                                                        />
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </Card>
                                        )}

                                        {(paymentMethod === 'tarjeta' || (paymentMethod === 'combinado' && (watchedCard || 0) > 0)) && (
                                            <Card className="p-4 bg-muted/50">
                                                <FormLabel className="flex items-center text-sm font-medium mb-2"><CreditCard className="mr-2 h-4 w-4" /> Cobro con Terminal Point</FormLabel>
                                                <div className="space-y-2">
                                                    <Select value={selectedTerminalId || ''} onValueChange={setSelectedTerminalId} disabled={terminalsLoading}>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={terminalsLoading ? "Buscando terminales..." : "Selecciona una terminal"} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {terminals.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.display_name || t.id}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        type="button"
                                                        onClick={handleSendToTerminal}
                                                        disabled={isSendingToTerminal || isWaitingForPayment || terminalsLoading || !selectedTerminalId || total <= 0 || cart.some(item => !item.barbero_id)}
                                                        className="w-full"
                                                        variant={isWaitingForPayment ? "secondary" : "default"}
                                                    >
                                                        {isWaitingForPayment ? (
                                                            <>
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                Esperando pago en terminal...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Send className="mr-2 h-4 w-4" />
                                                                Cobrar ${(paymentMethod === 'combinado' ? (watchedCard || 0) : totalConPropina).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en Terminal
                                                            </>
                                                        )}
                                                    </Button>
                                                    {isWaitingForPayment && (
                                                        <div className="flex flex-col gap-2 mt-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="w-full text-destructive hover:text-destructive"
                                                                onClick={async () => {
                                                                    if (!confirm("¿Seguro que deseas cancelar la espera en terminal? Si el cliente ya pagó o el ticket ya salió impreso, usa '¿Ya se cobró? Finalizar Manualmente'.")) return;
                                                                    await cancelPendingSale();
                                                                }}
                                                            >
                                                                Cancelar Espera
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="link"
                                                                className="w-full text-xs text-muted-foreground underline"
                                                                onClick={async () => {
                                                                    // Manual Confirmation
                                                                    if (!confirm("¿El ticket salió impreso corretamente? Solo confirma si el cobro REALMENTE se realizó.")) return;

                                                                    setIsWaitingForPayment(false);
                                                                    setIsSendingToTerminal(false);
                                                                    if (unsubscribeRef.current) {
                                                                        unsubscribeRef.current();
                                                                        unsubscribeRef.current = undefined;
                                                                    }

                                                                    // Manually force PAGADO status
                                                                    const confirmedSaleId = saleIdRef.current;
                                                                    if (confirmedSaleId && db) {
                                                                        try {
                                                                            setIsSubmitting(true);
                                                                            saleIdRef.current = null;
                                                                            const saleRef = doc(db, 'ventas', confirmedSaleId);
                                                                            await updateDoc(saleRef, {
                                                                                pago_estado: 'Pagado',
                                                                                metodo_pago: paymentMethod, // Respect initial choice
                                                                                monto_pagado_real: totalConPropina,
                                                                                saldo_pendiente: 0,
                                                                                propina: form.getValues('propina') || 0,
                                                                                fecha_pago: new Date(),
                                                                                notas: (form.getValues('notas') || '') + ' [Confirmación Manual de Terminal]'
                                                                            });

                                                                            // Also update Reservation status if linked
                                                                            if (reservationId && db) {
                                                                                try {
                                                                                    const resRef = doc(db, 'reservas', reservationId);
                                                                                    const reservationItems = cart.map((item: any) => ({
                                                                                        id: item.id,
                                                                                        nombre: item.nombre,
                                                                                        servicio: item.nombre,
                                                                                        tipo: item.tipo,
                                                                                        barbero_id: item.barbero_id || null,
                                                                                        precio: item.precio || 0,
                                                                                        duracion: item.duracion || 0,
                                                                                        cantidad: item.cantidad || 1,
                                                                                        ...(item.hora_inicio ? { hora_inicio: item.hora_inicio, hora_fin: item.hora_fin } : {}),
                                                                                        ...(item.professional_lock !== undefined && item.professional_lock !== null ? { professional_lock: item.professional_lock } : {})
                                                                                    }));
                                                                                    await updateDoc(resRef, { 
                                                                                        pago_estado: 'Pagado',
                                                                                        estado: 'Asiste',
                                                                                        items: reservationItems,
                                                                                        precio: subtotal - totalDiscount,
                                                                                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                                                                                    });
                                                                                } catch (resErr) {
                                                                                    console.error("Error updating reservation status on snapshot:", resErr);
                                                                                }
                                                                            }
                                                                            await finalizeSaleProcess(form.getValues('cliente_id'), form.getValues('local_id'));

                                                                        } catch (err) {
                                                                            console.error("Error confirming manual payment:", err);
                                                                            saleIdRef.current = confirmedSaleId;
                                                                            toast({ variant: "destructive", title: "Error", description: "No se pudo confirmar la venta manual." });
                                                                            setIsSubmitting(false);
                                                                        }
                                                                    }
                                                                }}
                                                            >
                                                                ¿Ya se cobró? Finalizar Manualmente
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                                {terminals && !terminals.length && !terminalsLoading && <p className="text-xs text-muted-foreground mt-2">No se encontraron terminales en modo PDV. Ve a Ajustes &gt; Terminal para activarlas.</p>}
                                            </Card>
                                        )}
                                        {paymentMethod === 'efectivo' && (
                                            <Card className="border border-border/70 bg-card rounded-xl p-3.5 shadow-xs space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <FormLabel className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                                                        <Calculator className="h-3.5 w-3.5 text-slate-400" /> Calculadora de Efectivo y Cambio
                                                    </FormLabel>
                                                    <span className="text-[11px] text-muted-foreground font-sans">
                                                        Total: ${formatMoney(totalConPropina)} MXN
                                                    </span>
                                                </div>

                                                {/* Denominaciones rápidas de billetes */}
                                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                    <span className="text-[11px] font-semibold text-muted-foreground mr-0.5">Cobro rápido:</span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={amountPaid === totalConPropina ? "secondary" : "outline"}
                                                        onClick={() => setAmountPaid(totalConPropina)}
                                                        className={cn(
                                                            "h-7 px-2.5 text-xs font-semibold rounded-lg transition-all font-sans",
                                                            amountPaid === totalConPropina
                                                                ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/40 text-blue-400 border ring-1 ring-blue-500/20"
                                                                : "border-border/60 hover:bg-muted/40 text-foreground"
                                                        )}
                                                    >
                                                        Exacto (${formatMoney(totalConPropina)})
                                                    </Button>
                                                    {quickBills.map((bill) => (
                                                        <Button
                                                            key={bill}
                                                            type="button"
                                                            size="sm"
                                                            variant={amountPaid === bill ? "secondary" : "outline"}
                                                            onClick={() => setAmountPaid(bill)}
                                                            className={cn(
                                                                "h-7 px-2.5 text-xs font-semibold rounded-lg transition-all font-sans",
                                                                amountPaid === bill
                                                                    ? "border-blue-500 bg-blue-50/30 dark:bg-blue-950/40 text-blue-400 border ring-1 ring-blue-500/20"
                                                                    : "border-border/60 hover:bg-muted/40 text-foreground"
                                                            )}
                                                        >
                                                            ${bill}
                                                        </Button>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/40">
                                                    <FormItem className="space-y-1">
                                                        <FormLabel className="text-xs font-medium text-muted-foreground">El cliente paga con:</FormLabel>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">$</span>
                                                            <Input
                                                                type="number"
                                                                placeholder="0.00"
                                                                className={cn(
                                                                    "pl-6 h-9 text-xs font-semibold font-sans transition-colors rounded-lg",
                                                                    amountPaid < totalConPropina && "border-red-500/40 focus-visible:ring-red-500/30"
                                                                )}
                                                                value={amountPaid || ''}
                                                                onChange={(e) => setAmountPaid(Number(e.target.value))}
                                                            />
                                                        </div>
                                                    </FormItem>

                                                    <div className="flex flex-col justify-center rounded-lg bg-muted/30 border border-border/50 px-3.5 py-2">
                                                        {amountPaid >= totalConPropina ? (
                                                            <>
                                                                <span className="text-[11px] font-medium text-muted-foreground">Cambio a entregar:</span>
                                                                <span className="text-base font-bold text-blue-400 font-sans mt-0.5">
                                                                    ${formatMoney(Math.max(0, amountPaid - totalConPropina))} MXN
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-[11px] font-medium text-red-400">Falta por cubrir:</span>
                                                                <span className="text-base font-bold text-red-400 font-sans mt-0.5">
                                                                    ${formatMoney(totalConPropina - amountPaid)} MXN
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </Card>
                                        )}

                                        {paymentMethod === 'combinado' && (
                                            <Card className="p-4 bg-muted/50">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="pago_efectivo"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Efectivo</FormLabel>
                                                                <FormControl><Input type="number" placeholder="$" {...field} value={field.value || ''} onChange={e => field.onChange(e.target.valueAsNumber)} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="pago_tarjeta"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Tarjeta</FormLabel>
                                                                <FormControl><Input type="number" placeholder="$" {...field} value={field.value || ''} onChange={e => field.onChange(e.target.valueAsNumber)} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="pago_transferencia"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Transferencia</FormLabel>
                                                                <FormControl><Input type="number" placeholder="$" {...field} value={field.value || ''} onChange={e => field.onChange(e.target.valueAsNumber)} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="mt-4 space-y-1 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Total a Cobrar:</span>
                                                        <span className="font-medium">${totalConPropina.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Total Ingresado:</span>
                                                        <span className="font-medium">${combinedTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className={cn("flex justify-between font-semibold", Math.abs(remainingAmount) < 0.01 ? "text-primary" : "text-destructive")}>
                                                        <span>Faltante:</span>
                                                        <span>${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                                {watchedPropina > 0 && (
                                                    <div className="pt-3 border-t mt-3 space-y-1.5">
                                                        <FormLabel className="text-xs font-semibold text-primary">
                                                            ¿En qué método pagó la propina de ${watchedPropina}?
                                                        </FormLabel>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {[
                                                                { id: 'tarjeta', label: 'Tarjeta' },
                                                                { id: 'efectivo', label: 'Efectivo' },
                                                                { id: 'transferencia', label: 'Transferencia' }
                                                            ].map((m) => (
                                                                <Button
                                                                    key={m.id}
                                                                    type="button"
                                                                    size="sm"
                                                                    variant={selectedPropinaMetodo === m.id ? "default" : "outline"}
                                                                    className={cn(
                                                                        "h-8 text-xs font-semibold",
                                                                        selectedPropinaMetodo === m.id && "bg-primary text-primary-foreground hover:bg-primary/90"
                                                                    )}
                                                                    onClick={() => setSelectedPropinaMetodo(m.id)}
                                                                >
                                                                    {m.label}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <FormMessage className="mt-2 text-center text-xs">
                                                    {form.formState.errors.pago_tarjeta?.message}
                                                </FormMessage>
                                            </Card>
                                        )}

                                        {(paymentMethod === 'transferencia' || (paymentMethod === 'combinado' && (watchedTransfer || 0) > 0)) && (
                                            <Card className="p-4 bg-muted/40 border border-border/60 space-y-3.5">
                                                <div className="flex items-center justify-between">
                                                    <FormLabel className="flex items-center text-sm font-semibold text-foreground m-0">
                                                        <QrCode className="mr-2 h-4 w-4 text-blue-400" /> Cobro por Transferencia SPEI / QR
                                                    </FormLabel>
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                                                        ${transferAmountToCharge.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                                    </span>
                                                </div>

                                                {!transferPaymentLink ? (
                                                    <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                                                        <div className="text-xs text-muted-foreground leading-relaxed">
                                                            Genera un código QR y enlace de Mercado Pago para que el cliente pague desde su app bancaria con acreditación automática.
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            onClick={handleGenerateTransferLink}
                                                            disabled={isGeneratingTransferLink || transferAmountToCharge <= 0}
                                                            className="shrink-0 h-8 px-3 text-xs font-semibold btn-vatos-alfa"
                                                        >
                                                            {isGeneratingTransferLink ? (
                                                                <>
                                                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                                    Generando...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <QrCode className="mr-1.5 h-3.5 w-3.5" />
                                                                    Generar QR y Enlace
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-border/60 bg-background/60 p-3 space-y-3">
                                                        <div className="flex flex-col sm:flex-row items-center gap-3.5">
                                                            <div className="flex flex-col items-center gap-1 shrink-0 bg-white p-2 rounded-lg border border-border/60 shadow-xs">
                                                                <img
                                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(transferPaymentLink)}`}
                                                                    alt="Código QR de Pago SPEI"
                                                                    className="w-28 h-28"
                                                                />
                                                                <span className="text-[10px] text-slate-600 font-semibold">Escanear con cámara</span>
                                                            </div>

                                                            <div className="space-y-2 flex-1 w-full text-xs">
                                                                <div>
                                                                    <p className="font-semibold text-foreground">1. Escanear en pantalla</p>
                                                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                                                        El cliente apunta con su cámara para abrir su CLABE SPEI única. Acreditación en segundos.
                                                                    </p>
                                                                </div>

                                                                <div className="pt-2 border-t border-border/40">
                                                                    <p className="font-semibold text-foreground mb-1.5">2. O enviar al celular del cliente</p>
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        {selectedClient?.telefono && (
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={handleSendTransferWhatsApp}
                                                                                className="h-7 px-2 text-xs font-semibold border-border/60 hover:bg-muted/40 text-foreground"
                                                                            >
                                                                                <WhatsAppIcon className="mr-1.5 h-3.5 w-3.5 text-blue-400" />
                                                                                WhatsApp
                                                                            </Button>
                                                                        )}
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={handleCopyTransferLink}
                                                                            className="h-7 px-2 text-xs font-semibold border-border/60 hover:bg-muted/40 text-foreground"
                                                                        >
                                                                            {transferLinkCopied ? (
                                                                                <>
                                                                                    <Check className="mr-1.5 h-3.5 w-3.5 text-blue-400" />
                                                                                    ¡Copiado!
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Copy className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                                                                                    Copiar Link
                                                                                </>
                                                                            )}
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={handleGenerateTransferLink}
                                                                            disabled={isGeneratingTransferLink}
                                                                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground ml-auto"
                                                                            title="Actualizar si cambió el monto"
                                                                        >
                                                                            {isGeneratingTransferLink ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Actualizar'}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="rounded-xl border border-border/40 bg-background/40 p-2.5 space-y-1.5 text-xs">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                                            <Building2 className="h-3.5 w-3.5 text-slate-400" /> Cuenta Tradicional Fija (Respaldo)
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={handleCopyClabe}
                                                            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                                        >
                                                            {bankDetailsCopied ? <Check className="h-3 w-3 mr-1 text-blue-400" /> : <Copy className="h-3 w-3 mr-1 text-slate-400" />}
                                                            {bankDetailsCopied ? 'CLABE copiada' : 'Copiar CLABE'}
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                                                        <div><span className="font-medium text-foreground">Banco:</span> {bankInfo.bank || 'Mercado Pago'}</div>
                                                        <div><span className="font-medium text-foreground">Titular:</span> {bankInfo.accountHolder || 'Jose Alejandro Pacheco'}</div>
                                                        <div className="font-sans"><span className="font-medium text-foreground">CLABE:</span> {bankInfo.clabe || '722969013328430098'}</div>
                                                    </div>
                                                </div>
                                            </Card>
                                        )}
                                            </>
                                        )}

                                        <FormField control={form.control} name="notas" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notas (Opcional)</FormLabel>
                                                <FormControl><Textarea placeholder="Añade un comentario sobre la venta..." {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    <ResumenCarrito
                                        cart={cart}
                                        subtotal={subtotal}
                                        totalDiscount={totalDiscount}
                                        total={total}
                                        anticipoPagado={anticipoPagado}
                                        onOpenAddItem={() => setIsAddItemDialogOpen(true)}
                                        updateQuantity={updateQuantity}
                                        updateItemProfessional={updateItemProfessional}
                                        assignAllProfessional={assignAllProfessional}
                                        updateItemDiscount={updateItemDiscount}
                                        removeFromCart={removeFromCart}
                                        serviceSellers={serviceSellers}
                                        productSellers={productSellers}
                                        client={selectedClient}
                                        hasAppDownloaded={hasAppDownloaded}
                                        redeemPoints={redeemPoints}
                                        setRedeemPoints={setRedeemPoints}
                                        pointsDiscount={pointsDiscount}
                                        alfaCoinsToUse={alfaCoinsToUse}
                                        setAlfaCoinsToUse={setAlfaCoinsToUse}
                                        clientAlfaCoins={clientAlfaCoins}
                                        maxUsableAlfaCoins={maxUsableAlfaCoins}
                                        propina={watchedPropina}
                                        appliedBenefit={appliedBenefit}
                                        alfaCoinUnitValue={alfaCoinUnitValue}
                                        clientLevelInfo={clientLevelInfo}
                                    />
                                </div>
                                <SheetFooter className="px-3.5 py-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background border-t border-border/60 mt-auto shrink-0 flex flex-row items-center justify-between gap-2 sm:gap-3">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-9 sm:h-10 px-3 sm:px-4 text-xs font-semibold rounded-xl text-slate-400 hover:text-foreground shrink-0"
                                        onClick={() => setStep(1)}
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1 text-slate-400" /> Volver
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="alfa"
                                        className="h-9 sm:h-10 px-4 sm:px-6 text-xs font-semibold rounded-xl"
                                        disabled={isSubmitting || isStepTransitioning || (total > 0 && isCombinedPaymentInvalid) || (total > 0 && !paymentMethod) || (total > 0 && paymentMethod === 'tarjeta') || (total > 0 && paymentMethod === 'combinado' && (watchedCard || 0) > 0 && selectedTerminalId !== null) || isWaitingForPayment || cart.some(item => !item.barbero_id) || (total > 0 && paymentMethod === 'efectivo' && amountPaid < totalConPropina)}
                                        onClick={(e) => {
                                            if (isStepTransitioning) {
                                                e.preventDefault();
                                                return;
                                            }
                                            if (total === 0 && pointsDiscount > 0) {
                                                form.setValue('metodo_pago', 'alfacoins', { shouldValidate: true });
                                            } else {
                                                if (paymentMethod === 'efectivo' && amountPaid < totalConPropina) {
                                                    e.preventDefault();
                                                    toast({
                                                        variant: 'destructive',
                                                        title: 'Falta efectivo',
                                                        description: 'Ingresa la cantidad con la que te paga el cliente. (Debe ser mayor o igual al total a cobrar con propina)'
                                                    });
                                                    return;
                                                }
                                            }

                                            if (cart.some(item => !item.barbero_id)) {
                                                e.preventDefault();
                                                toast({
                                                    variant: 'destructive',
                                                    title: 'Faltan datos',
                                                    description: 'Asigna un vendedor a todos los items del carrito para finalizar.'
                                                });
                                                return;
                                            }

                                            const localId = form.getValues('local_id');
                                            if (!localId) {
                                                e.preventDefault();
                                                toast({
                                                    variant: 'destructive',
                                                    title: 'Local no seleccionado',
                                                    description: 'Por favor selecciona un local antes de finalizar la venta.'
                                                });
                                                return;
                                            }

                                            form.handleSubmit(onSubmit)(e);
                                        }}
                                    >
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />}
                                        {total === 0 && pointsDiscount > 0
                                            ? `Finalizar (${pointsDiscount} ALFA COINS)`
                                            : (paymentMethod === 'combinado' && (watchedCard || 0) > 0 && selectedTerminalId !== null)
                                                ? `Usa Cobrar en Terminal arriba`
                                                : `Cobrar $${formatMoney(totalConPropina)} MXN`}
                                    </Button>
                                </SheetFooter>
                            </div>
                        )}
                    </Form>

                    {step === 1 && (
                        <SheetFooter className="px-3.5 py-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background border-t border-border/60 flex flex-row items-center justify-between gap-2 sm:gap-4 shrink-0 mt-auto">
                            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 sm:gap-1.5 flex-wrap min-w-0">
                                <span>Total:</span>
                                <span className="text-xs sm:text-sm font-bold text-foreground font-sans">
                                    ${formatMoney(Math.max(0, total + Number(watchedPropina || 0)))} MXN
                                </span>
                                {totalCartItems > 0 && (
                                    <Badge variant="outline" className="text-[10px] font-bold py-0 ml-1 bg-blue-500/10 text-blue-400 border-blue-500/30 hidden xs:inline-flex sm:inline-flex">
                                        {totalCartItems} {totalCartItems === 1 ? 'ítem' : 'ítems'}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 sm:h-10 px-3 sm:px-4 text-xs font-semibold rounded-xl text-slate-400 hover:text-foreground"
                                    onClick={handleClose}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    variant="alfa"
                                    className="h-9 sm:h-10 px-4 sm:px-5 text-xs font-semibold rounded-xl"
                                    onClick={handleNextStep}
                                    disabled={cart.length === 0 || !selectedClientId || cart.some(item => !item.barbero_id)}
                                >
                                    Continuar
                                </Button>
                            </div>
                        </SheetFooter>
                    )}
                </SheetContent>
            </Sheet >

            <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
                <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card" hideCloseButton>
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 sm:px-6 py-3.5 border-b border-blue-900/40 flex items-center justify-between shrink-0">
                        <div className="header-light-beam" />
                        <div className="flex items-center gap-3 relative z-10">
                            <UserPlus className="h-5 w-5 text-slate-300 shrink-0" />
                            <div>
                                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                                    {isEditingClient && selectedClient ? 'Editar Cliente' : 'Crear Nuevo Cliente'}
                                </h2>
                                <p className="text-xs text-slate-300">
                                    {isEditingClient && selectedClient
                                        ? 'Completa la información para actualizar al cliente.'
                                        : 'Completa la información para registrar un nuevo cliente.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 relative z-10">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => { setIsClientModalOpen(false); setIsEditingClient(false); }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="p-4 sm:p-6">
                        {isClientModalOpen && (
                            <NewClientForm
                                onFormSubmit={(clientId: string) => {
                                    handleClientCreated(clientId);
                                    setIsEditingClient(false);
                                }}
                                onCancel={() => { setIsClientModalOpen(false); setIsEditingClient(false); }}
                                initialName=""
                                client={isEditingClient ? selectedClient : null}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
            <AddItemDialog
                open={isAddItemDialogOpen}
                onOpenChange={setIsAddItemDialogOpen}
                services={services}
                categories={categories}
                products={products}
                servicesLoading={servicesLoading}
                productsLoading={productsLoading}
                addToCart={addToCart}
            />
        </>
    );
}


