'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, Timestamp, doc, updateDoc, runTransaction, DocumentReference, getDoc, getDocs, deleteDoc, onSnapshot, where, setDoc, query, increment, deleteField, serverTimestamp, FieldValue } from 'firebase/firestore'; // <--- AGREGADO setDoc, increment, deleteField, serverTimestamp, FieldValue
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
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
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
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2, UserPlus, X, Mail, Phone, Edit, Percent, DollarSign, Calculator, Send, Gift, Sparkles, ShoppingBag, ArrowRight, UserCheck, Check, QrCode, Building2, Copy, ExternalLink, Banknote, Receipt, Store, Coins, Layers, Wallet, User as UserIcon, Award, Crown, ShieldCheck } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';
import { ClientInput } from '../reservations/client-input';
import type { Service as ServiceType, Product, Client, User, Local, Profesional, Sale, SaleItem, ServiceCategory } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { format } from 'date-fns';
import {
    parseAndValidateReferralCode,
    findMatchingReferrerClient,
    validateInvitedClientEligibility,
    REFERRAL_DISCOUNT_PERCENT,
    REFERRAL_HOST_REWARD_COINS,
    calculateReferralMinNetPurchase,
    evaluateReferralPurchaseEligibility,
    validateJuntosSchedule,
    getCurrentHaircutPrice,
    calculateJuntosMinPurchase,
    calculateJuntosRewardCoins,
    JUNTOS_REWARD_COINS_PER_PERSON,
    formatJuntosDaysEs,
    formatJuntosHour12,
    evaluateClientAlfaTier,
    calculatePaseAlfaStatsFromSales,
    evaluatePaseAlfaStampsForSale,
    evaluateActiveCoinsMultiplier,
    type MultiplicadorCoinsConfig,
    DEFAULT_JUNTOS_CONFIG,
    type JuntosEsMejorConfig,
    DEFAULT_DECIMA_CONFIG,
    type DecimaCorteConfig,
    DEFAULT_COINS_CONFIG,
    type AlfaCoinsConfig,
    DEFAULT_REFERRAL_CONFIG,
    type ReferralProgramConfig,
    DEFAULT_CUMPLEANOS_CONFIG,
    resolveClientBirthdayGifts,
    formatBirthdayOptionSummary,
    MONTH_NAMES_ES,
    type CumpleanosBenefitConfig,
    type BirthdayGiftOption,
    type SaleLoyaltySnapshot,
} from '@/lib/benefit-security';
import {
    DEFAULT_SALDO_PASE_ALFA_CONFIG,
    getClientWalletBalance,
    normalizeSaldoPaseAlfaConfig,
    type SaldoPaseAlfaConfig,
} from '@/lib/wallet-config';
import { isClientWithApp } from '@/lib/client-app-helper';
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
function isFirestoreAtomicValue(val: any): boolean {
    if (!val || typeof val !== 'object') return false;
    return (
        val instanceof Date ||
        val instanceof Timestamp ||
        val instanceof FieldValue ||
        val instanceof DocumentReference ||
        typeof val.toDate === 'function' ||
        typeof val._methodName === 'string'
    );
}

function removeUndefinedFields(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (isFirestoreAtomicValue(obj)) return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefinedFields);
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            cleaned[key] = typeof value === 'object' && value !== null && !isFirestoreAtomicValue(value)
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
    addedByBirthdayBenefit?: boolean;
    birthdayDiscountApplied?: boolean;
    tierDiscountApplied?: boolean;
    vipMonthlyCourtesyItem?: boolean;
    addedByVipMonthly?: boolean;
    promoDiscountApplied?: boolean;
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
        promoCode?: string;
        promoRedeemed?: any;
        benefitRedeemed?: any;
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

const ResumenCarrito = ({
    cart, subtotal, totalDiscount, total, anticipoPagado, onOpenAddItem, updateQuantity,
    updateItemProfessional, assignAllProfessional, updateItemDiscount, removeFromCart,
    serviceSellers, productSellers, client, hasAppDownloaded, redeemPoints, setRedeemPoints,
    pointsDiscount, alfaCoinsToUse, setAlfaCoinsToUse, clientAlfaCoins, maxUsableAlfaCoins,
    propina, appliedBenefit, onApplyReferralCode, onRemoveBenefit, alfaCoinUnitValue, clientLevelInfo,
    juntosMinorsCount = 0, setJuntosMinorsCount, currentHaircutPrice = 140, targetStampsConfig = 9,
    activeCoinsMultiplier, juntosConfig = DEFAULT_JUNTOS_CONFIG,
    coinsConfig = DEFAULT_COINS_CONFIG,
    referralConfig = DEFAULT_REFERRAL_CONFIG,
    cumpleanosConfig = DEFAULT_CUMPLEANOS_CONFIG,
    selectedBirthdayOptionId = '',
    onSelectBirthdayOption,
    vipMonthlyCourtesyApplied = false,
    vipMonthlyUsedThisMonth = false,
    onToggleVipMonthlyCourtesy,
    walletAmountUsed = 0,
}: any) => {
    const [referralPrefixPart, setReferralPrefixPart] = useState('ALFA');
    const [referralNamePart, setReferralNamePart] = useState('');
    const [referralSuffixPart, setReferralSuffixPart] = useState('');
    const [referralError, setReferralError] = useState<string | null>(null);
    const [isValidatingReferral, setIsValidatingReferral] = useState(false);
    const referralNameRef = useRef<HTMLInputElement>(null);
    const referralSuffixRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setReferralError(null);
    }, [client?.id, appliedBenefit]);

    const handleTriggerReferralValidation = async () => {
        if (!onApplyReferralCode || isValidatingReferral) return;
        const prefix = (referralPrefixPart || 'ALFA').trim().toUpperCase();
        const name = referralNamePart.trim().toUpperCase();
        const suffix = referralSuffixPart.trim().toUpperCase();
        const fullCode = `${prefix}-${name}-${suffix}`;

        setIsValidatingReferral(true);
        setReferralError(null);
        try {
            const res = await onApplyReferralCode(fullCode);
            if (res && res.ok === false) {
                setReferralError(res.error || 'Código incorrecto o no válido.');
            } else {
                setReferralPrefixPart('ALFA');
                setReferralNamePart('');
                setReferralSuffixPart('');
                setReferralError(null);
            }
        } finally {
            setIsValidatingReferral(false);
        }
    };

    const handleReferralPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = (e.clipboardData?.getData('text') || '').trim().toUpperCase();
        if (!pasted) return;
        const cleanedParts = pasted.replace(/[^A-Z0-9-]/g, '').split('-').filter(Boolean);
        if (cleanedParts.length >= 2) {
            e.preventDefault();
            if (cleanedParts.length === 3) {
                setReferralPrefixPart(cleanedParts[0].slice(0, 4));
                setReferralNamePart(cleanedParts[1].replace(/[^A-Z]/g, '').slice(0, 12));
                setReferralSuffixPart(cleanedParts[2].replace(/[^A-Z0-9]/g, '').slice(0, 4));
            } else if (cleanedParts.length === 2) {
                setReferralNamePart(cleanedParts[0].replace(/[^A-Z]/g, '').slice(0, 12));
                setReferralSuffixPart(cleanedParts[1].replace(/[^A-Z0-9]/g, '').slice(0, 4));
            }
            setReferralError(null);
        }
    };
    const nowPreview = new Date();
    const todayPreviewStr = `${nowPreview.getFullYear()}-${String(nowPreview.getMonth() + 1).padStart(2, '0')}-${String(nowPreview.getDate()).padStart(2, '0')}`;
    const realMoneyPreview = Math.max(
        0,
        Math.round((Number(total || 0) + Number(anticipoPagado || 0) + Number(walletAmountUsed || 0)) * 100) / 100
    );
    const stampPreview = evaluatePaseAlfaStampsForSale({
        client,
        hasAppDownloaded: Boolean(hasAppDownloaded),
        cart,
        realMoneySpent: realMoneyPreview,
        currentHaircutPrice,
        targetStamps: targetStampsConfig,
        todayStr: todayPreviewStr,
        appliedBenefit,
    });
    const coinsPerPeso = coinsConfig?.activo !== false
        ? Math.max(0, Number(coinsConfig?.coins_por_peso ?? 1))
        : 0;
    const previewEarnedCoins = coinsConfig?.activo !== false && realMoneyPreview > 0
        ? Math.floor(realMoneyPreview * coinsPerPeso) * (activeCoinsMultiplier?.multiplier || 1)
        : 0;
    const refDiscountPct = Math.max(
        1,
        Math.min(100, Number(referralConfig?.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT))
    );
    const refHostCoins = Math.max(
        0,
        Number(referralConfig?.recompensa_anfitrion_coins ?? REFERRAL_HOST_REWARD_COINS)
    );
    const refMinGross = referralConfig?.consumo_minimo_tipo === 'monto_fijo'
        ? Math.max(1, Number(referralConfig?.consumo_minimo_monto) || currentHaircutPrice || 140)
        : (currentHaircutPrice || 140);
    const isBirthdayApplied = Boolean(
        appliedBenefit && (
            appliedBenefit.isBirthdayBenefit ||
            String(appliedBenefit.benefitId || '').toLowerCase().includes('cumple') ||
            String(appliedBenefit.benefitTitle || '').toLowerCase().includes('cumple')
        )
    );
    const birthdayTierId = (clientLevelInfo?.tierId || 'member') as 'member' | 'gold' | 'vip';
    const birthdayTierLabel = clientLevelInfo?.tierName || 'Alfa Member';
    const birthdayOptionsForClient = isBirthdayApplied
        ? resolveClientBirthdayGifts(birthdayTierId, cumpleanosConfig)
        : [];
    const activeBirthdayOption =
        birthdayOptionsForClient.find(
            (opt: BirthdayGiftOption) => opt.id === (selectedBirthdayOptionId || appliedBenefit?.birthdayOptionId)
        ) ||
        birthdayOptionsForClient[0] ||
        null;
    const currentMonthLabel = MONTH_NAMES_ES[nowPreview.getMonth()] || 'este mes';
    return (
    <div className="w-full bg-slate-50/70 dark:bg-slate-900/60 border border-border/80 rounded-2xl flex flex-col shadow-xs h-full min-h-0 flex-1 overflow-hidden">
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

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="p-3 sm:p-4 space-y-3 flex-1">
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
                                                !item.barbero_id && item.tipo === 'servicio' && "border-red-500/70 text-red-400 font-semibold shadow-2xs"
                                            )}>
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <UserIcon className="h-3 w-3 text-slate-400 shrink-0" />
                                                    <SelectValue placeholder={item.tipo === 'producto' ? "Vendedor (opcional)" : "Asignar barbero *"} />
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
                            <div className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-2 text-xs">
                                <div className="flex items-center justify-between text-foreground font-semibold gap-2">
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                        <Coins className="h-3.5 w-3.5 text-[#C5A880]" /> Recompensa Alfa Club
                                        {coinsConfig?.activo === false && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/30 font-sans">
                                                Pausado
                                            </span>
                                        )}
                                        {activeCoinsMultiplier?.isActive && coinsConfig?.activo !== false && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/40 font-sans">
                                                🔥 {activeCoinsMultiplier.shortBadge}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-[#C5A880] font-bold">
                                        +{previewEarnedCoins} ALFA COINS
                                    </span>
                                </div>
                                <div className="pt-1.5 border-t border-border/40 flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                            <Scissors className="h-3 w-3 text-blue-400" /> La Décima va por la Casa:
                                        </span>
                                        <span className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-md border font-sans",
                                            stampPreview.stampsToAward > 0
                                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                : "bg-slate-500/15 text-slate-300 border-slate-500/30"
                                        )}>
                                            {stampPreview.statusLabel}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-snug">
                                        {stampPreview.reason}
                                    </p>
                                </div>

                                {clientLevelInfo?.activo && (
                                    <div className="pt-1.5 border-t border-border/40 flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                                <ShieldCheck className="h-3 w-3 text-blue-400" /> Nivel y Privilegios:
                                            </span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-blue-500/15 text-blue-400 border-blue-500/30 font-sans">
                                                {clientLevelInfo.tierName} ({clientLevelInfo.cashbackPct}%)
                                            </span>
                                        </div>

                                        {Array.isArray(clientLevelInfo.beneficios) && clientLevelInfo.beneficios.length > 0 && (
                                            <ul className="space-y-0.5 pl-1">
                                                {clientLevelInfo.beneficios.slice(0, 4).map((b: string, idx: number) => (
                                                    <li key={idx} className="text-[10px] text-muted-foreground leading-snug flex items-start gap-1">
                                                        <span className="text-blue-400 shrink-0">•</span>
                                                        <span>{b}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        {clientLevelInfo.tierId === 'vip' && onToggleVipMonthlyCourtesy && (
                                            <div className="flex items-center justify-between gap-2 p-2 rounded-lg border border-blue-500/30 bg-blue-500/10">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-semibold text-blue-300 leading-tight">
                                                        Cortesía VIP Mensual ({currentMonthLabel})
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                                        1 Barba Express gratis por mes calendario
                                                    </p>
                                                </div>
                                                {vipMonthlyUsedThisMonth ? (
                                                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-500/20 text-slate-300 border border-slate-500/30 shrink-0">
                                                        Ya usada en {currentMonthLabel}
                                                    </span>
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={vipMonthlyCourtesyApplied ? 'destructive' : 'secondary'}
                                                        className={cn(
                                                            "h-7 px-2.5 text-[10px] font-bold rounded-md shrink-0",
                                                            !vipMonthlyCourtesyApplied && "bg-blue-600 hover:bg-blue-700 text-white"
                                                        )}
                                                        onClick={onToggleVipMonthlyCourtesy}
                                                    >
                                                        {vipMonthlyCourtesyApplied ? 'Quitar cortesía VIP' : 'Aplicar Barba Express'}
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </>
                )}
            </div>

        {/* Acciones directas si aún no hay beneficio activo */}
        {!appliedBenefit && (
            <div className="px-3 py-1.5 shrink-0 space-y-1.5">
                {onApplyReferralCode && referralConfig?.activo !== false && (
                    <>
                        <div
                            className={cn(
                                "flex flex-col gap-1.5 bg-muted/20 border rounded-xl p-2 transition-colors",
                                referralError ? "border-red-500/60 bg-red-500/5" : "border-border/60"
                            )}
                        >
                            <div className="flex items-center justify-between text-xs px-0.5">
                                <div className="flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                                    <span className="text-[11px] font-semibold text-foreground">
                                        Código Invita a un Amigo
                                    </span>
                                </div>
                                <span className="text-[10px] font-medium text-[#C5A880]">
                                    {refDiscountPct}% desc.
                                </span>
                            </div>
                            <div className="flex items-center gap-1 w-full min-w-0">
                                <Input
                                    value={referralPrefixPart}
                                    maxLength={4}
                                    onPaste={handleReferralPaste}
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
                                        setReferralPrefixPart(val);
                                        setReferralError(null);
                                        if (val.length === 4) {
                                            referralNameRef.current?.focus();
                                        }
                                    }}
                                    placeholder="ALFA"
                                    aria-label="Prefijo del código (4 letras)"
                                    className="h-7 w-12 shrink-0 text-center text-[11px] font-mono font-bold uppercase px-1 bg-background/80 border-border/60 rounded-lg focus-visible:ring-1 focus-visible:ring-[#C5A880]"
                                />
                                <span className="font-mono font-bold text-xs text-muted-foreground select-none shrink-0">-</span>
                                <Input
                                    ref={referralNameRef}
                                    value={referralNamePart}
                                    maxLength={12}
                                    onPaste={handleReferralPaste}
                                    onChange={(e) => {
                                        const raw = e.target.value.toUpperCase();
                                        if (raw.includes('-') || raw.includes(' ')) {
                                            const cleanName = raw.replace(/[^A-Z]/g, '').slice(0, 12);
                                            setReferralNamePart(cleanName);
                                            setReferralError(null);
                                            if (cleanName.length >= 2) {
                                                referralSuffixRef.current?.focus();
                                            }
                                            return;
                                        }
                                        setReferralNamePart(raw.replace(/[^A-Z]/g, '').slice(0, 12));
                                        setReferralError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Backspace' && !referralNamePart) {
                                            // Keep prefix easily editable only if empty
                                        } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (referralNamePart.length >= 2 && referralSuffixPart.length === 4) {
                                                handleTriggerReferralValidation();
                                            } else {
                                                referralSuffixRef.current?.focus();
                                            }
                                        }
                                    }}
                                    placeholder="NOMBRE"
                                    aria-label="Nombre en el código"
                                    className="h-7 flex-1 min-w-[50px] text-center text-[11px] font-mono font-semibold uppercase px-1.5 bg-background/80 border-border/60 rounded-lg focus-visible:ring-1 focus-visible:ring-[#C5A880]"
                                />
                                <span className="font-mono font-bold text-xs text-muted-foreground select-none shrink-0">-</span>
                                <Input
                                    ref={referralSuffixRef}
                                    value={referralSuffixPart}
                                    maxLength={4}
                                    onPaste={handleReferralPaste}
                                    onChange={(e) => {
                                        setReferralSuffixPart(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
                                        setReferralError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Backspace' && !referralSuffixPart) {
                                            referralNameRef.current?.focus();
                                        } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (
                                                referralPrefixPart.trim().length === 4 &&
                                                referralNamePart.trim().length >= 2 &&
                                                referralSuffixPart.trim().length === 4
                                            ) {
                                                handleTriggerReferralValidation();
                                            }
                                        }
                                    }}
                                    placeholder="XXXX"
                                    aria-label="Últimos 4 caracteres del código"
                                    className="h-7 w-12 shrink-0 text-center text-[11px] font-mono font-bold uppercase px-1 bg-background/80 border-border/60 rounded-lg focus-visible:ring-1 focus-visible:ring-[#C5A880]"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={
                                        isValidatingReferral ||
                                        referralPrefixPart.trim().length !== 4 ||
                                        referralNamePart.trim().length < 2 ||
                                        referralSuffixPart.trim().length !== 4
                                    }
                                    onClick={handleTriggerReferralValidation}
                                    className="h-7 px-2.5 sm:px-3 text-[10px] font-bold bg-[#C5A880] hover:bg-[#b0936b] text-black rounded-lg shrink-0 ml-0.5"
                                >
                                    {isValidatingReferral ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        'Validar'
                                    )}
                                </Button>
                            </div>
                        </div>
                        {referralError && (
                            <p className="text-[11px] text-red-400 font-medium px-1 leading-snug">
                                {referralError}
                            </p>
                        )}
                    </>
                )}
            </div>
        )}

        {/* Beneficio QR / Código Aplicado en Caja */}
        {appliedBenefit && (
            <div className={cn(
                "p-2.5 rounded-xl mx-3 my-1.5 flex flex-col gap-2 text-xs shrink-0 border",
                appliedBenefit.isReferralBlocked
                    ? "bg-red-500/10 border-red-500/40 text-red-200"
                    : "bg-[#C5A880]/10 border-[#C5A880]/30"
            )}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                        {appliedBenefit.isReferralBenefit || appliedBenefit.isJuntosBenefit ? (
                            <Users className={cn("h-4 w-4 shrink-0 mt-0.5", (appliedBenefit.isReferralBlocked || appliedBenefit.isFreeCutBlocked) ? "text-red-400" : "text-[#C5A880]")} />
                        ) : (
                            <Gift className={cn("h-4 w-4 shrink-0 mt-0.5", appliedBenefit.isFreeCutBlocked ? "text-red-400" : "text-[#C5A880]")} />
                        )}
                        <div className="min-w-0">
                            <p className={cn("font-bold text-xs", (appliedBenefit.isReferralBlocked || appliedBenefit.isFreeCutBlocked) ? "text-red-400" : "text-[#C5A880]")}>
                                {appliedBenefit.isReferralBenefit
                                    ? (appliedBenefit.isReferralBlocked ? '⛔ Invitación Bloqueada' : `Invita a un Amigo (${refDiscountPct}% Desc.)`)
                                    : appliedBenefit.isJuntosBenefit
                                    ? `JUNTOS ES MEJOR (+${Number(juntosConfig?.coins_por_persona) || JUNTOS_REWARD_COINS_PER_PERSON} Coins c/u)`
                                    : appliedBenefit.isFreeCutBlocked
                                    ? '⛔ Corte Gratis No Aplicable'
                                    : (appliedBenefit.benefitTitle || 'Beneficio Alfa Aplicado')}
                            </p>
                            {appliedBenefit.isReferralBlocked ? (
                                <p className="text-[10px] text-red-300 leading-snug mt-0.5">
                                    {appliedBenefit.referralBlockReason}
                                </p>
                            ) : appliedBenefit.isFreeCutBlocked ? (
                                <p className="text-[10px] text-red-300 leading-snug mt-0.5 font-medium">
                                    {appliedBenefit.freeCutBlockReason}
                                </p>
                            ) : appliedBenefit.isReferralBenefit && appliedBenefit.referrerName ? (
                                <div className="space-y-0.5 mt-0.5">
                                    <p className="text-[10px] text-muted-foreground font-sans">
                                        Anfitrión: <span className="text-foreground font-semibold">{appliedBenefit.referrerName}</span> {appliedBenefit.referralCode ? `(${appliedBenefit.referralCode})` : ''}
                                    </p>
                                    <p className="text-[10px] text-blue-400 font-medium font-sans">
                                        {(() => {
                                            const refPreview = evaluateReferralPurchaseEligibility({
                                                subtotal: Number(subtotal || 0),
                                                realMoneyPaid: realMoneyPreview,
                                                currentHaircutPrice: refMinGross,
                                                cart,
                                                discountPercent: refDiscountPct,
                                            });
                                            return refPreview.isEligible
                                                ? `✓ Consumo >= 1 Corte ($${formatMoney(refPreview.requiredGrossService)}): Anfitrión recibirá +${refHostCoins} Alfa Coins`
                                                : `⚠️ Requiere consumo en servicios >= 1 Corte ($${formatMoney(refPreview.requiredGrossService)} MXN antes de desc.) para acreditar +${refHostCoins} Alfa Coins`;
                                        })()}
                                    </p>
                                </div>
                            ) : appliedBenefit.isJuntosBenefit ? (
                                <div className="space-y-0.5 mt-0.5">
                                    <p className="text-[10px] text-muted-foreground font-sans">
                                        {appliedBenefit.juntosMode === 'companions_single_ticket'
                                            ? `✓ Grupo con App (1 Ticket · ${1 + (appliedBenefit.companions?.length || 0)} participantes)`
                                            : appliedBenefit.juntosMode === 'companions_separate_tickets'
                                            ? '✓ Grupo con App (Ticket Individual Verificado)'
                                            : `✓ Acompañantes menores sin app (${formatJuntosDaysEs(juntosConfig?.dias_semana)} ${formatJuntosHour12(juntosConfig?.hora_inicio)} a ${formatJuntosHour12(juntosConfig?.hora_fin)})`}
                                    </p>
                                </div>
                            ) : appliedBenefit.folio ? (
                                <p className="text-[10px] text-muted-foreground font-mono">
                                    Folio: {appliedBenefit.folio}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Badge className={cn(
                            "text-[10px] shrink-0 font-sans",
                            (appliedBenefit.isReferralBlocked || appliedBenefit.isFreeCutBlocked)
                                ? "bg-red-500/20 text-red-300 border-red-500/40"
                                : "bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/40"
                        )}>
                            {(appliedBenefit.isReferralBlocked || appliedBenefit.isFreeCutBlocked) ? 'No Elegible' : appliedBenefit.isReferralBenefit ? `-${refDiscountPct}% Amigo` : appliedBenefit.isJuntosBenefit ? '+Coins' : isBirthdayApplied ? birthdayTierLabel : 'Canjeado en QR'}
                        </Badge>
                        {onRemoveBenefit && (
                            <button
                                type="button"
                                onClick={onRemoveBenefit}
                                className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Quitar beneficio"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Sub-panel exclusivo para Regalo de Cumpleaños por Nivel */}
                {isBirthdayApplied && (
                    <div className="pt-2 border-t border-[#C5A880]/20 space-y-2 font-sans">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-foreground">
                                Opción de Cumpleaños ({birthdayTierLabel}):
                            </span>
                            {activeBirthdayOption && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                    {formatBirthdayOptionSummary(activeBirthdayOption)}
                                </span>
                            )}
                        </div>
                        {birthdayOptionsForClient.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground">
                                No hay regalos configurados para este nivel en Regalo de Cumpleaños.
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {birthdayOptionsForClient.map((opt: BirthdayGiftOption) => {
                                    const isSel = activeBirthdayOption?.id === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => onSelectBirthdayOption && onSelectBirthdayOption(opt.id)}
                                            className={cn(
                                                "w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors flex items-center justify-between gap-2",
                                                isSel
                                                    ? "bg-blue-500/15 border-blue-500/50 text-foreground"
                                                    : "bg-black/20 border-border/50 text-muted-foreground hover:border-border"
                                            )}
                                        >
                                            <span className="font-medium truncate">
                                                {isSel ? '● ' : '○ '}{opt.titulo}
                                            </span>
                                            <span className="text-[10px] font-semibold text-blue-300 shrink-0">
                                                {formatBirthdayOptionSummary(opt)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {activeBirthdayOption && (
                            <p className="text-[10px] text-blue-300/90 leading-snug">
                                {activeBirthdayOption.tipo === 'alfa_coins'
                                    ? `✓ Se acreditarán +${Math.max(0, Number(activeBirthdayOption.coinsCantidad || 0))} Alfa Coins automáticamente al finalizar la venta.`
                                    : activeBirthdayOption.tipo === 'articulo_fisico'
                                    ? `✓ Entrega física en recepción: ${activeBirthdayOption.targetItemNombre || activeBirthdayOption.instruccionesCaja || activeBirthdayOption.titulo}.`
                                    : '✓ Descuento aplicado en carrito. El cobro queda protegido si falta el ítem elegible.'}
                            </p>
                        )}
                    </div>
                )}

                {/* Sub-panel exclusivo para Juntos es Mejor: Modalidad Escaneada y Requisito de Consumo Dinámico */}
                {appliedBenefit.isJuntosBenefit && (() => {
                    const effHaircutPrice =
                        juntosConfig?.consumo_minimo_tipo === 'monto_fijo'
                            ? Number(juntosConfig?.consumo_minimo_monto) || currentHaircutPrice || 140
                            : currentHaircutPrice || 140;
                    const juntosCoinsPerPerson = Number(juntosConfig?.coins_por_persona) || JUNTOS_REWARD_COINS_PER_PERSON;
                    const mode = appliedBenefit.juntosMode || 'minors';
                    const companionsList = Array.isArray(appliedBenefit.companions) ? appliedBenefit.companions : [];
                    const servicesCountInCart = cart.reduce((acc: number, it: any) => acc + (it.tipo === 'servicio' ? Number(it.cantidad || 1) : 0), 0);

                    const countMinors = mode === 'minors' ? Math.max(1, Number(juntosMinorsCount || 1)) : 0;
                    const participantsInTicket =
                        mode === 'minors'
                            ? 1 + countMinors
                            : mode === 'companions_single_ticket'
                            ? 1 + Math.max(1, companionsList.length)
                            : 1; // companions_separate_tickets -> each pays their own ticket

                    const requiredTotal = Math.round(effHaircutPrice * participantsInTicket * 100) / 100;
                    const totalReward = juntosCoinsPerPerson * participantsInTicket;
                    const effectiveMoneyPaid = total + Number(anticipoPagado || 0) + Number(walletAmountUsed || 0);
                    const isAmountEligible = effectiveMoneyPaid >= requiredTotal;
                    const isServicesEligible = servicesCountInCart >= participantsInTicket;
                    const isEligible = isAmountEligible && isServicesEligible;

                    return (
                        <div className="pt-2 border-t border-[#C5A880]/20 space-y-2">
                            {mode === 'minors' && (
                                <div className="flex items-center justify-between gap-2 bg-black/20 p-2 rounded-lg border border-[#C5A880]/15">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold text-foreground leading-tight font-sans">
                                            Hijos menores sin app:
                                        </p>
                                        <p className="text-[10px] text-muted-foreground leading-tight font-sans">
                                            +{juntosCoinsPerPerson} Alfa Coins c/u (sin límite de hijos)
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 bg-muted/40 p-1 rounded-lg border border-border/60">
                                        <button
                                            type="button"
                                            disabled={countMinors <= 1}
                                            onClick={() => setJuntosMinorsCount && setJuntosMinorsCount(Math.max(1, countMinors - 1))}
                                            className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                                            title="Restar hijo menor"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="text-xs font-bold font-sans px-1.5 min-w-[20px] text-center text-foreground">
                                            {countMinors}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setJuntosMinorsCount && setJuntosMinorsCount(countMinors + 1)}
                                            className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                                            title="Sumar hijo menor"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {mode === 'companions_single_ticket' && companionsList.length > 0 && (
                                <div className="bg-black/20 p-2 rounded-lg border border-[#C5A880]/15 space-y-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-sans">
                                        Acompañantes verificados (+{juntosCoinsPerPerson} Coins a cada cuenta):
                                    </p>
                                    {companionsList.map((comp: any) => (
                                        <div key={comp.id} className="flex items-center justify-between text-[11px] font-sans">
                                            <span className="text-foreground font-medium truncate">{comp.name}</span>
                                            <span className="text-[#C5A880] font-semibold shrink-0">+{juntosCoinsPerPerson} Coins</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Consumo Mínimo Dinámico y Estado de Elegibilidad */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[11px] font-sans">
                                    <span className="text-muted-foreground">Consumo mínimo en ticket:</span>
                                    <span className="font-semibold text-foreground font-sans">
                                        ${formatMoney(requiredTotal)} MXN ({participantsInTicket} serv. · ${formatMoney(effHaircutPrice)} c/u)
                                    </span>
                                </div>
                                <p className={cn(
                                    "text-[10px] font-medium font-sans leading-tight",
                                    isEligible ? "text-blue-400" : "text-red-400"
                                )}>
                                    {!isServicesEligible
                                        ? `⚠️ Agrega al menos ${participantsInTicket} servicio(s) al carrito (actual: ${servicesCountInCart}) para acreditar las +${totalReward} Alfa Coins.`
                                        : !isAmountEligible
                                        ? `⚠️ Falta $${formatMoney(Math.max(0, requiredTotal - effectiveMoneyPaid))} MXN en dinero real (sin AlfaCoins) para alcanzar $${formatMoney(requiredTotal)} MXN.`
                                        : mode === 'companions_single_ticket'
                                        ? `✓ Requisitos cubiertos: se abonarán +${juntosCoinsPerPerson} Alfa Coins al titular y +${juntosCoinsPerPerson} a cada acompañante al cobrar.`
                                        : mode === 'companions_separate_tickets'
                                        ? `✓ Requisitos cubiertos: pago individual validado. Los +${juntosCoinsPerPerson} Alfa Coins de cada integrante se acreditarán al completar el pago de todo el grupo hoy.`
                                        : `✓ Requisitos cubiertos: se abonarán +${totalReward} Alfa Coins al titular (${participantsInTicket} participantes) al cobrar.`}
                                </p>
                            </div>
                        </div>
                    );
                })()}
            </div>
        )}

        {/* Resumen Financiero y Totales */}
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
                    {Number(walletAmountUsed || 0) > 0 && (
                        <div className="flex justify-between text-blue-400">
                            <span>Cubierto con Saldo Pase Alfa</span>
                            <span className="font-semibold font-sans">-${formatMoney(Number(walletAmountUsed))} MXN</span>
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
    </div>
    );
};

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
                            <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">Agregar al Carrito</DialogTitle>
                            <DialogDescription className="text-xs text-slate-300">Selecciona servicios o productos para añadir.</DialogDescription>
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
    const canViewPhone = useMemo(() => {
        if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
        return Boolean(user?.permissions?.includes('ver_numero_telefono'));
    }, [user]);
    const canEditClient = useMemo(() => {
        if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
        return Boolean(user?.permissions?.includes('editar_clientes'));
    }, [user]);
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
    const attemptedTerminalIdsRef = useRef<Set<string>>(new Set());

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
    const [useWallet, setUseWallet] = useState(false);
    const [walletCustomAmount, setWalletCustomAmount] = useState<number | null>(null);
    const [saldoPaseAlfaConfig, setSaldoPaseAlfaConfig] = useState<SaldoPaseAlfaConfig>(DEFAULT_SALDO_PASE_ALFA_CONFIG);
    const [appliedBenefit, setAppliedBenefit] = useState<any | null>(null);
    const [juntosMinorsCount, setJuntosMinorsCount] = useState<number>(0);
    const currentHaircutPrice = useMemo(() => getCurrentHaircutPrice(services), [services]);
    const [nivelesConfig, setNivelesConfig] = useState<any>(null);
    const [multiplicadorCoinsConfig, setMultiplicadorCoinsConfig] = useState<MultiplicadorCoinsConfig | null>(null);
    const [juntosConfig, setJuntosConfig] = useState<JuntosEsMejorConfig>(DEFAULT_JUNTOS_CONFIG);
    const [targetStampsConfig, setTargetStampsConfig] = useState<number>(9);
    const [decimaConfig, setDecimaConfig] = useState<DecimaCorteConfig>(DEFAULT_DECIMA_CONFIG);
    const [coinsConfig, setCoinsConfig] = useState<AlfaCoinsConfig>(DEFAULT_COINS_CONFIG);
    const [referralConfig, setReferralConfig] = useState<ReferralProgramConfig>(DEFAULT_REFERRAL_CONFIG);
    const [cumpleanosConfig, setCumpleanosConfig] = useState<CumpleanosBenefitConfig>(DEFAULT_CUMPLEANOS_CONFIG);
    const [selectedBirthdayOptionId, setSelectedBirthdayOptionId] = useState<string>('');
    const [vipMonthlyUsedThisMonth, setVipMonthlyUsedThisMonth] = useState<boolean>(false);
    const [vipMonthlyCourtesyApplied, setVipMonthlyCourtesyApplied] = useState<boolean>(false);
    const currentYearMonth = format(new Date(), 'yyyy-MM');
    const [reconciledClientStats, setReconciledClientStats] = useState<{
        clientId: string;
        visits: number;
        spend: number;
    } | null>(null);

    const activeCoinsMultiplier = useMemo(
        () => evaluateActiveCoinsMultiplier(multiplicadorCoinsConfig),
        [multiplicadorCoinsConfig]
    );

    // Suscripción en tiempo real a la configuración completa del Pase Alfa (Niveles, Multiplicador, Juntos, Décima, Coins, Referidos, Cumpleaños)
    useEffect(() => {
        if (!db) return;
        const unsubPase = onSnapshot(
            doc(db, 'configuracion', 'pase_alfa'),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.niveles_config) {
                        setNivelesConfig(data.niveles_config);
                    }
                    if (data.multiplicador_coins_config) {
                        setMultiplicadorCoinsConfig(data.multiplicador_coins_config);
                    }
                    if (data.juntos_config) {
                        setJuntosConfig({ ...DEFAULT_JUNTOS_CONFIG, ...data.juntos_config });
                    }
                    if (data.decima_config) {
                        setDecimaConfig({ ...DEFAULT_DECIMA_CONFIG, ...data.decima_config });
                    }
                    if (data.coins_config) {
                        setCoinsConfig({ ...DEFAULT_COINS_CONFIG, ...data.coins_config });
                    }
                    if (data.referral_config) {
                        setReferralConfig({ ...DEFAULT_REFERRAL_CONFIG, ...data.referral_config });
                    }
                    if (data.cumpleanos_config) {
                        setCumpleanosConfig({ ...DEFAULT_CUMPLEANOS_CONFIG, ...data.cumpleanos_config });
                    }
                    if (data.saldo_pase_alfa_config) {
                        setSaldoPaseAlfaConfig(normalizeSaldoPaseAlfaConfig(data.saldo_pase_alfa_config));
                    }
                    const sReq = Number(data.sellosRequeridos || 10);
                    setTargetStampsConfig(sReq === 10 ? 9 : sReq);
                }
            },
            () => {}
        );
        const unsubApp = onSnapshot(
            doc(db, 'configuracion', 'app_movil'),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const cfg = data.niveles_config || data.pase_alfa?.niveles_config || data['pase_alfa.niveles_config'];
                    if (cfg) {
                        setNivelesConfig((prev: any) => prev || cfg);
                    }
                    const multCfg = data.multiplicador_coins_config || data.pase_alfa?.multiplicador_coins_config;
                    if (multCfg) {
                        setMultiplicadorCoinsConfig((prev) => prev || multCfg);
                    }
                    const junCfg = data.juntos_config || data.pase_alfa?.juntos_config;
                    if (junCfg) {
                        setJuntosConfig((prev) => ({ ...DEFAULT_JUNTOS_CONFIG, ...junCfg, ...prev }));
                    }
                    const decCfg = data.decima_config || data.pase_alfa?.decima_config;
                    if (decCfg) {
                        setDecimaConfig((prev) => ({ ...DEFAULT_DECIMA_CONFIG, ...decCfg, ...prev }));
                    }
                    const coiCfg = data.coins_config || data.pase_alfa?.coins_config;
                    if (coiCfg) {
                        setCoinsConfig((prev) => ({ ...DEFAULT_COINS_CONFIG, ...coiCfg, ...prev }));
                    }
                    const refCfg = data.referral_config || data.pase_alfa?.referral_config;
                    if (refCfg) {
                        setReferralConfig((prev) => ({ ...DEFAULT_REFERRAL_CONFIG, ...refCfg, ...prev }));
                    }
                    const cumCfg = data.cumpleanos_config || data.pase_alfa?.cumpleanos_config;
                    if (cumCfg) {
                        setCumpleanosConfig((prev) => ({ ...DEFAULT_CUMPLEANOS_CONFIG, ...cumCfg, ...prev }));
                    }
                    const saldoCfg = data.saldo_pase_alfa_config || data.pase_alfa?.saldo_pase_alfa_config;
                    if (saldoCfg) {
                        setSaldoPaseAlfaConfig((prev) => prev || normalizeSaldoPaseAlfaConfig(saldoCfg));
                    }
                }
            },
            () => {}
        );
        return () => {
            unsubPase();
            unsubApp();
        };
    }, [db]);

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

    // Auto-reconciliar historial real de visitas y consumo acumulado ($ MXN) desde la colección `ventas`
    useEffect(() => {
        if (!db || !selectedClient?.id) {
            setReconciledClientStats(null);
            return;
        }
        let cancelled = false;
        const reconcileFromSales = async () => {
            try {
                const qSales = query(collection(db, 'ventas'), where('cliente_id', '==', selectedClient.id));
                const snapSales = await getDocs(qSales);
                let paidVisits = 0;
                let paidSpend = 0;
                const visitDays = new Set<string>();

                snapSales.docs.forEach((d) => {
                    const s = d.data();
                    const st = String(s.pago_estado || '').toLowerCase();
                    if (st === 'cancelado' || st === 'pendiente' || st === 'pending_payment' || st === 'pendiente_anticipo') {
                        return;
                    }
                    // Evitar duplicar monto si es un anticipo que ya fue absorbido en una venta de liquidación
                    // o si es una recarga de Saldo Pase Alfa (el consumo se suma al gastar el saldo en servicios)
                    if (s.absorbed_in_sale_id || s.tipo_venta === 'recarga_monedero' || d.id.startsWith('topup_')) {
                        return;
                    }
                    const saleTotal = Number(s.total ?? s.monto_pagado_real ?? 0);
                    const coinsDisc = Number(s.descuento_alfacoins ?? 0);
                    const realPaid = Math.max(0, saleTotal - coinsDisc);
                    paidSpend += realPaid;

                    const items = Array.isArray(s.items) ? s.items : [];
                    const hasService = items.length === 0 || items.some((it: any) => it.tipo === 'servicio' || !it.tipo);
                    if (hasService && s.tipo_venta !== 'anticipo' && !d.id.startsWith('deposit_')) {
                        const dt = s.fecha_hora_venta?.toDate
                            ? s.fecha_hora_venta.toDate()
                            : s.creado_en?.toDate
                            ? s.creado_en.toDate()
                            : null;
                        const dayKey = dt ? dt.toISOString().split('T')[0] : d.id;
                        visitDays.add(dayKey);
                    }
                });

                paidVisits = visitDays.size;
                paidSpend = Math.round(paidSpend * 100) / 100;

                if (cancelled) return;

                const storedVisits = Math.max(
                    Number(selectedClient.citas_asistidas ?? 0),
                    Number((selectedClient as any).visitas_totales ?? 0),
                    Number(selectedClient.cortes_acumulados ?? selectedClient.cortesAcumulados ?? 0)
                );
                const storedSpend = Math.max(
                    Number((selectedClient as any).consumo_total ?? 0),
                    Number(selectedClient.gasto_total ?? 0),
                    Number((selectedClient as any).consumoTotal ?? 0)
                );

                const bestVisits = Math.max(storedVisits, paidVisits);
                const bestSpend = Math.max(storedSpend, paidSpend);

                // Regla Oficial Pase Alfa: Las compras y visitas anteriores al registro en la App Móvil
                // NO cuentan para subir de nivel en el Pase Alfa (sí se conservan en su historial general).
                const allSalesDocs = snapSales.docs.map((d) => ({ id: d.id, ...d.data() }));
                const paseAlfaFromSales = calculatePaseAlfaStatsFromSales(allSalesDocs, selectedClient);
                const storedPaseAlfaVisits = Math.max(
                    Number((selectedClient as any).visitas_pase_alfa ?? 0),
                    Number(selectedClient.cortes_acumulados ?? selectedClient.cortesAcumulados ?? 0)
                );
                const storedPaseAlfaSpend = Number((selectedClient as any).consumo_pase_alfa ?? 0);

                const bestPaseAlfaVisits = Math.max(storedPaseAlfaVisits, paseAlfaFromSales.visits);
                const bestPaseAlfaSpend = Math.max(storedPaseAlfaSpend, paseAlfaFromSales.spend);

                setReconciledClientStats({
                    clientId: selectedClient.id,
                    visits: bestPaseAlfaVisits,
                    spend: bestPaseAlfaSpend,
                });

                const evaluated = evaluateClientAlfaTier(selectedClient, nivelesConfig, {
                    overrideVisits: bestPaseAlfaVisits,
                    overrideSpend: bestPaseAlfaSpend,
                    forceEvaluateWhenPaused: true,
                });

                const needsGeneralSync = bestSpend > storedSpend + 0.5 || bestVisits > storedVisits;
                const needsPaseAlfaSync =
                    isClientWithApp(selectedClient) &&
                    ((selectedClient as any).visitas_pase_alfa !== bestPaseAlfaVisits ||
                        Math.abs(Number((selectedClient as any).consumo_pase_alfa ?? 0) - bestPaseAlfaSpend) > 0.5 ||
                        (evaluated.tierName && evaluated.tierName !== 'Sin Nivel' && selectedClient.nivel !== evaluated.tierName));

                if (needsGeneralSync || needsPaseAlfaSync) {
                    const updateFields: any = {
                        citas_asistidas: bestVisits,
                        visitas_totales: bestVisits,
                        consumo_total: bestSpend,
                        gasto_total: bestSpend,
                        consumoTotal: bestSpend,
                    };
                    if (isClientWithApp(selectedClient)) {
                        updateFields.visitas_pase_alfa = bestPaseAlfaVisits;
                        updateFields.consumo_pase_alfa = bestPaseAlfaSpend;
                        if (evaluated.tierName && evaluated.tierName !== 'Sin Nivel') {
                            updateFields.nivel = evaluated.tierName;
                        }
                    }
                    await updateDoc(doc(db, 'clientes', selectedClient.id), updateFields).catch(() => {});
                }
            } catch (_) {}
        };

        reconcileFromSales();
        return () => {
            cancelled = true;
        };
    }, [db, selectedClient?.id, nivelesConfig]);

    const clientLevelInfo = useMemo(() => {
        const isCurrentReconciled =
            Boolean(reconciledClientStats && selectedClient && reconciledClientStats.clientId === selectedClient.id);
        return evaluateClientAlfaTier(selectedClient, nivelesConfig, {
            overrideVisits: isCurrentReconciled ? reconciledClientStats?.visits : undefined,
            overrideSpend: isCurrentReconciled ? reconciledClientStats?.spend : undefined,
        });
    }, [selectedClient, nivelesConfig, reconciledClientStats]);

    const alfaCoinUnitValue = clientLevelInfo.coinValue;

    const hasAppDownloaded = useMemo(() => {
        return isClientWithApp(selectedClient);
    }, [selectedClient]);

    const clientAlfaCoins = useMemo(() => {
        if (!selectedClient || !hasAppDownloaded) return 0;
        return Number(selectedClient.alfaCoins ?? (selectedClient as any).alfa_coins ?? selectedClient.puntosLealtad ?? (selectedClient as any).puntos_lealtad ?? selectedClient.puntos ?? 0);
    }, [selectedClient, hasAppDownloaded]);

    const clientCashAvailable = useMemo(() => {
        return Math.round(clientAlfaCoins * alfaCoinUnitValue * 100) / 100;
    }, [clientAlfaCoins, alfaCoinUnitValue]);

    const maxUsableAlfaCoins = useMemo(() => {
        if (!selectedClient || clientAlfaCoins <= 0 || alfaCoinUnitValue <= 0) return 0;
        if (coinsConfig.activo === false) return 0;
        const minCanje = Math.max(0, Number(coinsConfig.minimo_canje_coins || 0));
        if (minCanje > 0 && clientAlfaCoins < minCanje) return 0;

        // Calcular base elegible según aplicable_en ('ambos' | 'servicios' | 'productos')
        const aplicableEn = coinsConfig.aplicable_en || 'ambos';
        const eligibleSubtotal = cart.reduce((acc, item) => {
            if (aplicableEn === 'servicios' && item.tipo !== 'servicio') return acc;
            if (aplicableEn === 'productos' && item.tipo !== 'producto') return acc;
            const gross = (Number(item.precio) || 0) * (Number(item.cantidad) || 1);
            const discVal = Number(item.discountValue) || 0;
            const disc = item.discountType === 'percentage' ? (gross * discVal) / 100 : discVal;
            return acc + Math.max(0, gross - disc);
        }, 0);

        const currentTotalBeforeCoins = Math.max(0, subtotal - totalDiscount - anticipoPagado);
        const capPct = Math.min(100, Math.max(1, Number(coinsConfig.tope_descuento_pct || 100)));
        const maxMoneyByCap = Math.min(currentTotalBeforeCoins, (eligibleSubtotal * capPct) / 100);
        if (maxMoneyByCap <= 0) return 0;

        const coinsNeededForCap = Math.ceil(maxMoneyByCap / alfaCoinUnitValue);
        return Math.min(clientAlfaCoins, coinsNeededForCap);
    }, [selectedClient, clientAlfaCoins, subtotal, totalDiscount, anticipoPagado, alfaCoinUnitValue, coinsConfig, cart]);

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

    const clientWalletBalance = useMemo(() => {
        if (!selectedClient || !hasAppDownloaded) return 0;
        return getClientWalletBalance(selectedClient);
    }, [selectedClient, hasAppDownloaded]);

    const maxUsableWalletAmount = useMemo(() => {
        if (!selectedClient || !hasAppDownloaded || clientWalletBalance <= 0) return 0;
        if (saldoPaseAlfaConfig.activo === false) return 0;

        const currentTotalBeforeWallet = Math.max(
            0,
            Math.round((subtotal - totalDiscount - anticipoPagado - pointsDiscount) * 100) / 100
        );
        if (currentTotalBeforeWallet <= 0) return 0;

        if (saldoPaseAlfaConfig.aplicable_en === 'servicios') {
            const servicesNet = cart.reduce((acc, item) => {
                if (item.tipo !== 'servicio') return acc;
                const gross = (Number(item.precio) || 0) * (Number(item.cantidad) || 1);
                const discVal = Number(item.discountValue) || 0;
                const disc = item.discountType === 'percentage' ? (gross * discVal) / 100 : discVal;
                return acc + Math.max(0, gross - disc);
            }, 0);
            return Math.min(
                clientWalletBalance,
                currentTotalBeforeWallet,
                Math.round(servicesNet * 100) / 100
            );
        }

        return Math.min(clientWalletBalance, currentTotalBeforeWallet);
    }, [
        selectedClient,
        hasAppDownloaded,
        clientWalletBalance,
        saldoPaseAlfaConfig,
        subtotal,
        totalDiscount,
        anticipoPagado,
        pointsDiscount,
        cart,
    ]);

    const effectiveWalletAmountToUse = useMemo(() => {
        if (!useWallet || maxUsableWalletAmount <= 0) return 0;
        if (walletCustomAmount === null) return maxUsableWalletAmount;
        return Math.round(Math.min(Math.max(0, walletCustomAmount), maxUsableWalletAmount) * 100) / 100;
    }, [useWallet, maxUsableWalletAmount, walletCustomAmount]);

    const total = useMemo(
        () => Math.max(0, Math.round((subtotal - totalDiscount - anticipoPagado - pointsDiscount - effectiveWalletAmountToUse) * 100) / 100),
        [subtotal, totalDiscount, anticipoPagado, pointsDiscount, effectiveWalletAmountToUse]
    );

    useEffect(() => {
        if (redeemPoints && maxUsableAlfaCoins <= 0) {
            setRedeemPoints(false);
            setAlfaCoinsToUse(null);
        }
    }, [redeemPoints, maxUsableAlfaCoins]);

    useEffect(() => {
        if (useWallet && maxUsableWalletAmount <= 0) {
            setUseWallet(false);
            setWalletCustomAmount(null);
        }
    }, [useWallet, maxUsableWalletAmount]);

    // Verificar en tiempo real si el cliente Alfa Black VIP ya usó su cortesía mensual de Barba Express este mes
    useEffect(() => {
        if (!isOpen || !db || !selectedClient?.id) {
            setVipMonthlyUsedThisMonth(false);
            setVipMonthlyCourtesyApplied(false);
            return;
        }
        const storedMonth = String((selectedClient as any)?.ultimo_canje_cortesia_vip_mes || '');
        if (storedMonth === currentYearMonth) {
            setVipMonthlyUsedThisMonth(true);
            setVipMonthlyCourtesyApplied(false);
            return;
        }
        let cancelled = false;
        const vipFolio = `VA-VIP-MES-${currentYearMonth}-${selectedClient.id}`;
        getDoc(doc(db, 'canjes_beneficios', vipFolio))
            .then((snap) => {
                if (cancelled) return;
                const used = snap.exists() && String(snap.data()?.estado || '') !== 'cancelado';
                setVipMonthlyUsedThisMonth(used);
                if (used) {
                    setVipMonthlyCourtesyApplied(false);
                }
            })
            .catch(() => {
                if (!cancelled) setVipMonthlyUsedThisMonth(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, db, selectedClient?.id, (selectedClient as any)?.ultimo_canje_cortesia_vip_mes, currentYearMonth]);

    // Sincronizar opción seleccionada para Regalo de Cumpleaños según nivel del cliente
    useEffect(() => {
        const isBirthday = Boolean(
            appliedBenefit && (
                appliedBenefit.isBirthdayBenefit ||
                String(appliedBenefit.benefitId || '').toLowerCase().includes('cumple') ||
                String(appliedBenefit.benefitTitle || '').toLowerCase().includes('cumple')
            )
        );
        if (!isBirthday) {
            if (selectedBirthdayOptionId) setSelectedBirthdayOptionId('');
            return;
        }
        const tierId = (clientLevelInfo?.tierId || 'member') as 'member' | 'gold' | 'vip';
        const options = resolveClientBirthdayGifts(tierId, cumpleanosConfig);
        if (options.length === 0) {
            if (selectedBirthdayOptionId) setSelectedBirthdayOptionId('');
            return;
        }
        const preferred =
            options.find((o) => o.id === selectedBirthdayOptionId) ||
            options.find((o) => o.id === appliedBenefit?.birthdayOptionId) ||
            options[0];
        if (preferred && preferred.id !== selectedBirthdayOptionId) {
            setSelectedBirthdayOptionId(preferred.id);
        }
    }, [appliedBenefit, clientLevelInfo?.tierId, cumpleanosConfig, selectedBirthdayOptionId]);

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
                setUseWallet(false);
                setWalletCustomAmount(null);
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
            const applyReferralDiscount =
                tipo === 'servicio' &&
                Boolean(appliedBenefit?.isReferralBenefit) &&
                !Boolean(appliedBenefit?.isReferralBlocked) &&
                referralConfig.activo !== false;
            const applyTierProductDiscount =
                tipo === 'producto' &&
                Boolean(clientLevelInfo.activo) &&
                Number(clientLevelInfo.productDiscountPct) > 0;

            return [...prev, {
                uniqueId: crypto.randomUUID(),
                id: item.id,
                nombre: itemName,
                precio: itemPrice || 0,
                cantidad: 1,
                tipo,
                presentation_id,
                ...(applyReferralDiscount ? {
                    discountValue: String(Number(referralConfig.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT)),
                    discountType: 'percentage' as const,
                } : applyTierProductDiscount ? {
                    discountValue: String(clientLevelInfo.productDiscountPct),
                    discountType: 'percentage' as const,
                    tierDiscountApplied: true,
                } : {})
            }];
        });
    };

    // Aplicar o retirar automáticamente el descuento en productos configurado en el Nivel Alfa del cliente
    useEffect(() => {
        const tierProdPct = clientLevelInfo.activo ? Number(clientLevelInfo.productDiscountPct || 0) : 0;

        setCart(prev => {
            let changed = false;
            const next = prev.map(it => {
                if (it.tipo !== 'producto' || it.birthdayDiscountApplied) return it;
                if (tierProdPct > 0 && (!it.discountValue || Number(it.discountValue) === 0 || (it.tierDiscountApplied && Number(it.discountValue) !== tierProdPct))) {
                    changed = true;
                    return {
                        ...it,
                        discountValue: String(tierProdPct),
                        discountType: 'percentage' as const,
                        tierDiscountApplied: true,
                    };
                }
                if (
                    tierProdPct <= 0 &&
                    (it.tierDiscountApplied ||
                        (it.discountType === 'percentage' && (Number(it.discountValue) === 10 || Number(it.discountValue) === 15)))
                ) {
                    changed = true;
                    return {
                        ...it,
                        discountValue: '0',
                        discountType: 'fixed' as const,
                        tierDiscountApplied: false,
                    };
                }
                return it;
            });
            return changed ? next : prev;
        });
    }, [clientLevelInfo.activo, clientLevelInfo.productDiscountPct, selectedClientId, cart.length]);

    // Aplicar o retirar automáticamente el descuento dinámico de referido sobre los servicios del carrito
    useEffect(() => {
        if (!appliedBenefit?.isReferralBenefit) return;
        const refDiscountPct = Number(referralConfig.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT);

        if (appliedBenefit.isReferralBlocked || referralConfig.activo === false) {
            setCart(prev =>
                prev.map(it =>
                    it.tipo === 'servicio' &&
                    it.discountType === 'percentage' &&
                    (Number(it.discountValue) === refDiscountPct || Number(it.discountValue) === REFERRAL_DISCOUNT_PERCENT)
                        ? { ...it, discountValue: '0', discountType: 'fixed' }
                        : it
                )
            );
        } else {
            setCart(prev =>
                prev.map(it =>
                    it.tipo === 'servicio' && (!it.discountValue || Number(it.discountValue) === 0)
                        ? { ...it, discountValue: String(refDiscountPct), discountType: 'percentage' }
                        : it
                )
            );
        }
    }, [appliedBenefit?.isReferralBenefit, appliedBenefit?.isReferralBlocked, referralConfig.descuento_amigo_pct, referralConfig.activo, cart.length]);

    // Helper para identificar el servicio individual independiente de corte de cabello (excluyendo paquetes)
    const isIndividualHaircutItem = useCallback((it: any) => {
        if (it.tipo !== 'servicio') return false;
        const name = (it.nombre || it.name || '').toLowerCase().trim();
        const cat = (it.categoria || it.category || '').toLowerCase().trim();
        const isPkg = it.esPaquete === true || it.es_paquete === true;
        if (
            isPkg ||
            cat.includes('paquete') ||
            cat.includes('combo') ||
            /^[1-5]\s+/i.test(name) ||
            name.includes('paquete') ||
            name.includes('combo') ||
            name.includes('el caballero alfa') ||
            name.includes('renovación alfa') ||
            name.includes('renovacion alfa') ||
            name.includes('héroe en descanso') ||
            name.includes('heroe en descanso') ||
            name.includes('alfa superior') ||
            name.includes('todo para el campeón') ||
            name.includes('todo para el campeon')
        ) {
            return false;
        }
        return (
            name.includes('corte de cabello') ||
            name.includes('corte tradicional') ||
            name.includes('corte clásico') ||
            name.includes('corte clasico') ||
            name === 'corte'
        );
    }, []);

    // Aplicar automáticamente el descuento del 10.° Corte Gratis ("La Décima Va por la Casa")
    useEffect(() => {
        const isFreeCut =
            appliedBenefit?.benefitId === 'decimo_corte' ||
            appliedBenefit?.benefitId === 'corte_gratis' ||
            String(appliedBenefit?.folio || '').startsWith('VA-CORTE');
        if (!isFreeCut) return;

        const decimaMaxCoverage =
            decimaConfig.cobertura_tipo === 'monto_fijo' && Number(decimaConfig.cobertura_monto || 0) > 0
                ? Number(decimaConfig.cobertura_monto)
                : Number(currentHaircutPrice || 140);
        const allowPackages = decimaConfig.solo_corte_individual === false;

        const hasIndividualHaircut = cart.some(isIndividualHaircutItem);
        const hasAnyService = cart.some(it => it.tipo === 'servicio');
        const hasPackage = cart.some(item => {
            const it = item as any;
            if (it.tipo !== 'servicio') return false;
            const name = (it.nombre || it.name || '').toLowerCase();
            const cat = (it.categoria || it.category || '').toLowerCase();
            return (
                Boolean(it.esPaquete || it.es_paquete) ||
                cat.includes('paquete') ||
                cat.includes('combo') ||
                name.includes('paquete') ||
                name.includes('combo') ||
                name.includes('el caballero alfa') ||
                name.includes('renovación alfa') ||
                name.includes('renovacion alfa') ||
                name.includes('héroe en descanso') ||
                name.includes('heroe en descanso') ||
                name.includes('alfa superior') ||
                name.includes('todo para el campeón') ||
                name.includes('todo para el campeon')
            );
        });

        const hasEligibleItem = hasIndividualHaircut || (allowPackages && hasAnyService);

        if (!hasEligibleItem) {
            if (hasPackage && !allowPackages && !appliedBenefit.isFreeCutBlocked) {
                setAppliedBenefit((prev: any) =>
                    prev ? {
                        ...prev,
                        isFreeCutBlocked: true,
                        freeCutBlockReason: `⚠️ No aplicable a Paquetes. El 10.° Corte Gratis aplica exclusivamente para el servicio individual independiente de Corte de cabello ($${formatMoney(decimaMaxCoverage)} MXN).`
                    } : prev
                );
                toast({
                    variant: 'destructive',
                    title: 'Beneficio No Válido para Paquetes',
                    description: 'El 10.° corte gratis no aplica sobre paquetes ni combos. Requiere agregar el servicio individual independiente de Corte de cabello.',
                });
            }
            return;
        }

        // Si hay ítem elegible, desbloquear si estaba bloqueado
        if (appliedBenefit.isFreeCutBlocked) {
            setAppliedBenefit((prev: any) =>
                prev ? {
                    ...prev,
                    isFreeCutBlocked: false,
                    freeCutBlockReason: undefined,
                } : prev
            );
        }

        const isTargetFreeCutItem = (it: CartItem) =>
            isIndividualHaircutItem(it) || (allowPackages && it.tipo === 'servicio');

        setCart(prev => {
            const alreadyApplied = prev.some(
                it => isTargetFreeCutItem(it) && Number(it.discountValue) > 0
            );
            if (alreadyApplied) return prev;

            let targetIdx = prev.findIndex(isIndividualHaircutItem);
            if (targetIdx === -1 && allowPackages) {
                targetIdx = prev.findIndex(it => it.tipo === 'servicio' && (it.nombre || '').toLowerCase().includes('corte'));
                if (targetIdx === -1) {
                    targetIdx = prev.findIndex(it => it.tipo === 'servicio');
                }
            }
            if (targetIdx === -1) return prev;

            const targetItem = prev[targetIdx];
            const itemPrice = Number(targetItem.precio) || 0;
            const freeCutDiscountAmt = Math.min(itemPrice, decimaMaxCoverage);
            if (freeCutDiscountAmt <= 0) return prev;

            return prev.map((it, idx) =>
                idx === targetIdx
                    ? {
                          ...it,
                          discountValue: String(freeCutDiscountAmt),
                          discountType: 'fixed' as const,
                      }
                    : it
            );
        });
    }, [appliedBenefit?.benefitId, appliedBenefit?.folio, appliedBenefit?.isFreeCutBlocked, cart, currentHaircutPrice, decimaConfig, isIndividualHaircutItem, toast]);

    const appliedBirthdaySyncRef = useRef<string>('');

    // Aplicar automáticamente el Regalo de Cumpleaños seleccionado según el nivel real del cliente
    useEffect(() => {
        const isBirthday = Boolean(
            appliedBenefit && (
                appliedBenefit.isBirthdayBenefit ||
                String(appliedBenefit.benefitId || '').toLowerCase().includes('cumple') ||
                String(appliedBenefit.benefitTitle || '').toLowerCase().includes('cumple')
            )
        );
        if (!isBirthday) {
            if (appliedBirthdaySyncRef.current) {
                appliedBirthdaySyncRef.current = '';
            }
            return;
        }

        const tierId = (clientLevelInfo?.tierId || 'member') as 'member' | 'gold' | 'vip';
        const options = resolveClientBirthdayGifts(tierId, cumpleanosConfig);
        const activeOpt =
            options.find((o) => o.id === (selectedBirthdayOptionId || appliedBenefit?.birthdayOptionId)) ||
            options[0] ||
            null;
        const syncKey = `${appliedBenefit?.folio || 'bday'}::${tierId}::${activeOpt?.id || 'none'}`;
        const isNewSync = appliedBirthdaySyncRef.current !== syncKey;
        if (isNewSync) {
            appliedBirthdaySyncRef.current = syncKey;
        }

        if (!isNewSync && (!activeOpt || activeOpt.tipo === 'alfa_coins' || activeOpt.tipo === 'articulo_fisico')) {
            return;
        }

        setCart(prev => {
            let changed = false;
            let next = [...prev];

            if (isNewSync) {
                const cleaned = next
                    .filter(it => !it.addedByBirthdayBenefit)
                    .map(it =>
                        it.birthdayDiscountApplied
                            ? { ...it, birthdayDiscountApplied: false, discountValue: '0', discountType: 'fixed' as const }
                            : it
                    );
                if (cleaned.length !== next.length || cleaned.some((it, i) => it !== next[i])) {
                    changed = true;
                }
                next = cleaned;
            }

            if (activeOpt?.tipo === 'servicio_gratis' && (activeOpt.targetItemId || activeOpt.targetItemNombre)) {
                const alreadyDiscounted = next.some(it => it.birthdayDiscountApplied);
                if (!alreadyDiscounted) {
                    const maxCap = Number(activeOpt.topeMonto || 0);
                    const targetIdx = next.findIndex(
                        it =>
                            it.tipo === 'servicio' &&
                            ((activeOpt.targetItemId && it.id === activeOpt.targetItemId) ||
                                (activeOpt.targetItemNombre &&
                                    it.nombre.toLowerCase().trim() === activeOpt.targetItemNombre.toLowerCase().trim()))
                    );
                    if (targetIdx !== -1) {
                        const rawPrice = Number(next[targetIdx].precio) || 0;
                        const discAmt = maxCap > 0 ? Math.min(rawPrice, maxCap) : rawPrice;
                        next[targetIdx] = {
                            ...next[targetIdx],
                            birthdayDiscountApplied: true,
                            discountValue: String(discAmt),
                            discountType: 'fixed',
                        };
                        changed = true;
                    } else if (isNewSync) {
                        const svc = services?.find(
                            (s) =>
                                (activeOpt.targetItemId && s.id === activeOpt.targetItemId) ||
                                (activeOpt.targetItemNombre &&
                                    s.name.toLowerCase().trim() === activeOpt.targetItemNombre.toLowerCase().trim())
                        );
                        if (svc) {
                            const rawPrice = Number(svc.price) || 0;
                            const discAmt = maxCap > 0 ? Math.min(rawPrice, maxCap) : rawPrice;
                            next.push({
                                uniqueId: crypto.randomUUID(),
                                id: svc.id,
                                nombre: svc.name,
                                precio: rawPrice,
                                cantidad: 1,
                                tipo: 'servicio',
                                duracion: svc.duration,
                                addedByBirthdayBenefit: true,
                                birthdayDiscountApplied: true,
                                discountValue: String(discAmt),
                                discountType: 'fixed',
                            });
                            changed = true;
                        }
                    }
                }
            } else if (activeOpt?.tipo === 'producto_gratis' && (activeOpt.targetItemId || activeOpt.targetItemNombre)) {
                const alreadyDiscounted = next.some(it => it.birthdayDiscountApplied);
                if (!alreadyDiscounted) {
                    const maxCap = Number(activeOpt.topeMonto || 0);
                    const targetIdx = next.findIndex(
                        it =>
                            it.tipo === 'producto' &&
                            ((activeOpt.targetItemId && it.id === activeOpt.targetItemId) ||
                                (activeOpt.targetItemNombre &&
                                    it.nombre.toLowerCase().trim() === activeOpt.targetItemNombre.toLowerCase().trim()))
                    );
                    if (targetIdx !== -1) {
                        const rawPrice = Number(next[targetIdx].precio) || 0;
                        const discAmt = maxCap > 0 ? Math.min(rawPrice, maxCap) : rawPrice;
                        next[targetIdx] = {
                            ...next[targetIdx],
                            birthdayDiscountApplied: true,
                            discountValue: String(discAmt),
                            discountType: 'fixed',
                        };
                        changed = true;
                    } else if (isNewSync) {
                        const prod = products?.find(
                            (p) =>
                                (activeOpt.targetItemId && p.id === activeOpt.targetItemId) ||
                                (activeOpt.targetItemNombre &&
                                    p.nombre.toLowerCase().trim() === activeOpt.targetItemNombre.toLowerCase().trim())
                        );
                        if (prod) {
                            const rawPrice = Number(prod.public_price) || 0;
                            const discAmt = maxCap > 0 ? Math.min(rawPrice, maxCap) : rawPrice;
                            next.push({
                                uniqueId: crypto.randomUUID(),
                                id: prod.id,
                                nombre: prod.nombre,
                                precio: rawPrice,
                                cantidad: 1,
                                tipo: 'producto',
                                presentation_id: prod.presentation_id,
                                addedByBirthdayBenefit: true,
                                birthdayDiscountApplied: true,
                                discountValue: String(discAmt),
                                discountType: 'fixed',
                            });
                            changed = true;
                        }
                    }
                }
            } else if (activeOpt?.tipo === 'descuento_servicio' && Number(activeOpt.descuentoValor || 0) > 0) {
                const discVal = Number(activeOpt.descuentoValor || 0);
                if (activeOpt.descuentoTipo === 'fixed') {
                    const alreadyHas = next.some(it => it.birthdayDiscountApplied);
                    if (!alreadyHas) {
                        const svcIdx = next.findIndex(it => it.tipo === 'servicio' && !it.vipMonthlyCourtesyItem);
                        if (svcIdx !== -1) {
                            const maxDisc = Math.min(Number(next[svcIdx].precio) || 0, discVal);
                            next[svcIdx] = {
                                ...next[svcIdx],
                                birthdayDiscountApplied: true,
                                discountValue: String(maxDisc),
                                discountType: 'fixed',
                            };
                            changed = true;
                        }
                    }
                } else {
                    const pct = Math.min(100, Math.max(1, discVal));
                    next = next.map(it => {
                        if (it.tipo === 'servicio' && !it.vipMonthlyCourtesyItem && !it.birthdayDiscountApplied && (!it.discountValue || Number(it.discountValue) === 0)) {
                            changed = true;
                            return {
                                ...it,
                                birthdayDiscountApplied: true,
                                discountValue: String(pct),
                                discountType: 'percentage' as const,
                            };
                        }
                        return it;
                    });
                }
            }

            return changed ? next : prev;
        });
    }, [appliedBenefit, clientLevelInfo?.tierId, cumpleanosConfig, selectedBirthdayOptionId, cart.length, services, products]);

    // Validación Zero-Trust cuando se selecciona al cliente en Caja con un código de referido activo
    useEffect(() => {
        if (!appliedBenefit?.isReferralBenefit || !selectedClient || !db) return;

        if (referralConfig.activo === false) {
            const msg = '⛔ El programa "Invita a un Amigo" está temporalmente pausado en Configuración.';
            if (!appliedBenefit.isReferralBlocked || appliedBenefit.referralBlockReason !== msg) {
                setAppliedBenefit((prev: any) => prev ? { ...prev, isReferralBlocked: true, referralBlockReason: msg } : null);
            }
            return;
        }

        let cancelled = false;
        const verifyClientEligibility = async () => {
            let previousSalesCount = 0;
            let alreadyRedeemedReferral = false;
            let hostMonthRedemptions = 0;
            const monthlyLimit = Math.max(0, Number(referralConfig.limite_mensual_invitaciones || 0));
            const curMonthPrefix = format(new Date(), 'yyyy-MM');

            try {
                const queries: Promise<any>[] = [
                    getDocs(query(collection(db, 'ventas'), where('cliente_id', '==', selectedClient.id))),
                    getDocs(query(collection(db, 'canjes_beneficios'), where('clienteId', '==', selectedClient.id))),
                ];
                if (monthlyLimit > 0 && appliedBenefit.referrerId) {
                    queries.push(
                        getDocs(query(collection(db, 'canjes_beneficios'), where('referrerId', '==', appliedBenefit.referrerId)))
                    );
                }
                const results = await Promise.all(queries);
                const snapSales = results[0];
                const snapCanjes = results[1];
                const snapHostCanjes = results[2];

                previousSalesCount = snapSales.docs.filter((d: any) => {
                    const sd = d.data();
                    const st = (sd.pago_estado || '').toLowerCase();
                    // Excluir anticipos de la primera cita (para que un cliente nuevo que pagó anticipo online no sea rechazado)
                    if (sd.tipo_venta === 'anticipo' || d.id.startsWith('deposit_') || sd.absorbed_in_sale_id) {
                        return false;
                    }
                    return sd.estado !== 'cancelada' && st !== 'cancelado' && st !== 'pendiente';
                }).length;
                alreadyRedeemedReferral = snapCanjes.docs.some((d: any) => {
                    const cd = d.data();
                    return cd.benefitId === 'invita_amigo' && cd.estado === 'canjeado';
                });
                if (snapHostCanjes) {
                    hostMonthRedemptions = snapHostCanjes.docs.filter((d: any) => {
                        const cd = d.data();
                        if (cd.benefitId !== 'invita_amigo' || cd.estado !== 'canjeado') return false;
                        const dt = cd.fecha?.toDate ? cd.fecha.toDate() : cd.creado_en?.toDate ? cd.creado_en.toDate() : null;
                        return dt ? format(dt, 'yyyy-MM') === curMonthPrefix : false;
                    }).length;
                }
            } catch (e) {
                console.warn('Error verificando historial de ventas para referido:', e);
            }

            if (cancelled) return;

            const enforceNewClient = referralConfig.solo_clientes_nuevos !== false;
            const eligibility = alreadyRedeemedReferral
                ? {
                      isEligible: false,
                      rejectionReason: `⛔ BENEFICIO YA UTILIZADO: "${selectedClient.nombre || ''}" ya canjeó un código de invitación previamente.`,
                  }
                : monthlyLimit > 0 && hostMonthRedemptions >= monthlyLimit
                ? {
                      isEligible: false,
                      rejectionReason: `⛔ LÍMITE MENSUAL ALCANZADO: El anfitrión ya alcanzó su límite de ${monthlyLimit} invitaciones canjeadas este mes.`,
                  }
                : validateInvitedClientEligibility(
                      selectedClient,
                      {
                          id: appliedBenefit.referrerId,
                          nombre: appliedBenefit.referrerName,
                          telefono: appliedBenefit.referrerPhone,
                      },
                      enforceNewClient ? previousSalesCount : 0
                  );

            if (!eligibility.isEligible) {
                if (!appliedBenefit.isReferralBlocked || appliedBenefit.referralBlockReason !== eligibility.rejectionReason) {
                    setAppliedBenefit((prev: any) =>
                        prev
                            ? {
                                  ...prev,
                                  isReferralBlocked: true,
                                  referralBlockReason: eligibility.rejectionReason,
                              }
                            : null
                    );
                    toast({
                        variant: 'destructive',
                        title: '⛔ Cliente No Elegible para "Invita a un Amigo"',
                        description: eligibility.rejectionReason,
                    });
                }
            } else if (appliedBenefit.isReferralBlocked) {
                setAppliedBenefit((prev: any) =>
                    prev
                        ? {
                              ...prev,
                              isReferralBlocked: false,
                              referralBlockReason: undefined,
                          }
                        : null
                );
            }
        };

        verifyClientEligibility();
        return () => {
            cancelled = true;
        };
    }, [selectedClient, appliedBenefit?.isReferralBenefit, appliedBenefit?.referrerId, referralConfig, db, toast]);

    const handleApplyManualReferralCode = useCallback(
        async (rawCode: string): Promise<{ ok: boolean; error?: string }> => {
            if (referralConfig.activo === false) {
                const msg = '⛔ El programa "Invita a un Amigo" está temporalmente pausado en Configuración.';
                toast({ variant: 'destructive', title: 'Programa Pausado', description: msg });
                return { ok: false, error: msg };
            }

            // 1. Validar nomenclatura y bloquear códigos genéricos o de invitado
            const formatCheck = parseAndValidateReferralCode(rawCode);
            if (!formatCheck.isValidFormat) {
                const msg = formatCheck.rejectionReason || '⛔ CÓDIGO INCORRECTO: Verifica el formato ALFA-NOMBRE-XXXX.';
                toast({
                    variant: 'destructive',
                    title: '⛔ Código Incorrecto',
                    description: msg,
                });
                return { ok: false, error: msg };
            }

            // 2. Corroborar en la base de datos oficial que el código pertenezca a un miembro activo de la App
            let clientsPool = clients || [];
            let match = findMatchingReferrerClient(clientsPool, rawCode);

            if ((!match.hostClient || match.error) && db) {
                try {
                    const freshSnap = await getDocs(collection(db, 'clientes'));
                    clientsPool = freshSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
                    match = findMatchingReferrerClient(clientsPool, rawCode);
                } catch (e) {
                    console.warn('Error verificando código de invitación en Firestore:', e);
                }
            }

            const { hostClient, parsed, error } = match;
            if (!hostClient || error) {
                const msg = error || `⛔ CÓDIGO INCORRECTO: El código "${formatCheck.fullCode}" no existe en VATOS ALFA.`;
                toast({
                    variant: 'destructive',
                    title: '⛔ Código Incorrecto',
                    description: msg,
                });
                return { ok: false, error: msg };
            }

            const monthlyLimit = Math.max(0, Number(referralConfig.limite_mensual_invitaciones || 0));
            if (monthlyLimit > 0 && db) {
                try {
                    const hostSnap = await getDocs(query(collection(db, 'canjes_beneficios'), where('referrerId', '==', hostClient.id)));
                    const curMonthPrefix = format(new Date(), 'yyyy-MM');
                    const hostCount = hostSnap.docs.filter((d) => {
                        const cd = d.data();
                        if (cd.benefitId !== 'invita_amigo' || cd.estado !== 'canjeado') return false;
                        const dt = cd.fecha?.toDate ? cd.fecha.toDate() : cd.creado_en?.toDate ? cd.creado_en.toDate() : null;
                        return dt ? format(dt, 'yyyy-MM') === curMonthPrefix : false;
                    }).length;
                    if (hostCount >= monthlyLimit) {
                        const msg = `⛔ LÍMITE MENSUAL ALCANZADO: ${hostClient.nombre} ya alcanzó el máximo de ${monthlyLimit} invitados en este mes.`;
                        toast({ variant: 'destructive', title: '⛔ Límite Alcanzado', description: msg });
                        return { ok: false, error: msg };
                    }
                } catch (e) {
                    console.warn('Error verificando límite mensual de anfitrión:', e);
                }
            }

            // 3. Corroborar que el cliente en caja cumpla las reglas (cliente nuevo excluyendo anticipos, sin compras previas ni auto-invitación)
            if (selectedClient) {
                let previousSalesCount = 0;
                let alreadyRedeemedReferral = false;

                if (db && selectedClient.id) {
                    try {
                        const [snapSales, snapCanjes] = await Promise.all([
                            getDocs(query(collection(db, 'ventas'), where('cliente_id', '==', selectedClient.id))),
                            getDocs(query(collection(db, 'canjes_beneficios'), where('clienteId', '==', selectedClient.id))),
                        ]);
                        previousSalesCount = snapSales.docs.filter(d => {
                            const sd = d.data();
                            const st = (sd.pago_estado || '').toLowerCase();
                            if (sd.tipo_venta === 'anticipo' || d.id.startsWith('deposit_') || sd.absorbed_in_sale_id) {
                                return false;
                            }
                            return sd.estado !== 'cancelada' && st !== 'cancelado' && st !== 'pendiente';
                        }).length;
                        alreadyRedeemedReferral = snapCanjes.docs.some(d => {
                            const cd = d.data();
                            return cd.benefitId === 'invita_amigo' && cd.estado === 'canjeado';
                        });
                    } catch (e) {
                        console.warn('Error verificando historial del cliente invitado:', e);
                    }
                }

                if (alreadyRedeemedReferral) {
                    const msg = `⛔ BENEFICIO YA UTILIZADO: "${selectedClient.nombre}" ya utilizó un código de Invita a un Amigo previamente.`;
                    toast({
                        variant: 'destructive',
                        title: '⛔ Promoción No Aplicable',
                        description: msg,
                    });
                    return { ok: false, error: msg };
                }

                const enforceNewClient = referralConfig.solo_clientes_nuevos !== false;
                const eligibility = validateInvitedClientEligibility(
                    selectedClient,
                    hostClient,
                    enforceNewClient ? previousSalesCount : 0
                );
                if (!eligibility.isEligible) {
                    toast({
                        variant: 'destructive',
                        title: '⛔ Cliente No Elegible',
                        description: eligibility.rejectionReason,
                    });
                    return { ok: false, error: eligibility.rejectionReason };
                }
            }

            const refDiscountPct = Math.max(1, Math.min(100, Number(referralConfig.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT)));
            const refHostCoins = Math.max(0, Number(referralConfig.recompensa_anfitrion_coins ?? REFERRAL_HOST_REWARD_COINS));
            const refMinBase = referralConfig.consumo_minimo_tipo === 'monto_fijo'
                ? Math.max(1, Number(referralConfig.consumo_minimo_monto) || currentHaircutPrice || 140)
                : (currentHaircutPrice || 140);

            const hostFullName = `${hostClient.nombre} ${hostClient.apellido || ''}`.trim();
            const folio = `VA-REF-${parsed.suffix}-${Date.now().toString().slice(-4)}`;

            setAppliedBenefit({
                folio,
                benefitTitle: 'Invita a un Amigo',
                benefitId: 'invita_amigo',
                isReferralBenefit: true,
                referralCode: parsed.fullCode,
                referrerId: hostClient.id,
                referrerName: hostFullName,
                referrerPhone: hostClient.telefono || '',
                discount: refDiscountPct,
                rewardCoins: refHostCoins,
                minPurchase: Math.round(refMinBase * (1 - refDiscountPct / 100) * 100) / 100,
                isReferralBlocked: false,
            });

            toast({
                title: '🎉 ¡Código de Invitación Validado!',
                description: `Anfitrión: ${hostFullName}. Se aplicó ${refDiscountPct}% de descuento en los servicios del cliente invitado.`,
            });
            return { ok: true };
        },
        [clients, selectedClient, currentHaircutPrice, referralConfig, toast, db]
    );

    // Auto-detectar si el cliente seleccionado tiene un registro grupal pre-verificado de "Juntos es Mejor" (Tickets Separados) hoy
    useEffect(() => {
        if (!isOpen || !db || !selectedClient?.id || appliedBenefit) return;
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const grpFolio = `VA-JUNTOS-GRP-${todayStr}-${selectedClient.id}`;
        const juntosCoins = Number(juntosConfig?.coins_por_persona) || JUNTOS_REWARD_COINS_PER_PERSON;

        getDoc(doc(db, 'canjes_beneficios', grpFolio))
            .then(snap => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.estado === 'pendiente_cobro_grupo' && !data.pagado && !data.utilizado_en_venta) {
                        const grpMembers = Array.isArray(data.grupoMiembros)
                            ? data.grupoMiembros.map((m: any) => ({ id: m.id, name: m.nombre || m.name || '' }))
                            : [];
                        setAppliedBenefit({
                            folio: grpFolio,
                            benefitTitle: 'JUNTOS ES MEJOR',
                            benefitId: 'juntos_es_mejor',
                            isJuntosBenefit: true,
                            juntosMode: 'companions_separate_tickets',
                            juntosGroupId: data.grupoId || undefined,
                            companions: grpMembers,
                            rewardCoinsPerPerson: juntosCoins,
                            isScheduleValid: true,
                            minorsCount: 0,
                        });
                        setJuntosMinorsCount(0);
                        toast({
                            title: '🤝 Grupo "Juntos es Mejor" Detectado',
                            description: `${selectedClient.nombre} forma parte de un grupo verificado hoy. Al completar el pago de todo el grupo se acreditarán +${juntosCoins} Alfa Coins a cada integrante.`,
                        });
                    }
                }
            })
            .catch(() => {});
    }, [isOpen, db, selectedClient?.id, appliedBenefit, toast, juntosConfig?.coins_por_persona]);

    const handleRemoveAppliedBenefit = useCallback(() => {
        const refPct = Number(referralConfig.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT);
        const maxDecimaCov = Math.max(Number(currentHaircutPrice || 140), Number(decimaConfig.cobertura_monto || 140));

        setCart(prev => {
            const withoutAdded = prev.filter(it => !it.addedByBirthdayBenefit);
            return withoutAdded.map(it => {
                if (it.birthdayDiscountApplied) {
                    return { ...it, birthdayDiscountApplied: false, discountValue: '0', discountType: 'fixed' as const };
                }
                if (it.promoDiscountApplied) {
                    return { ...it, promoDiscountApplied: false, discountValue: '0', discountType: 'fixed' as const };
                }
                if (
                    appliedBenefit?.isReferralBenefit &&
                    it.tipo === 'servicio' &&
                    it.discountType === 'percentage' &&
                    (Number(it.discountValue) === refPct || Number(it.discountValue) === REFERRAL_DISCOUNT_PERCENT)
                ) {
                    return { ...it, discountValue: '0', discountType: 'fixed' as const };
                }
                if (
                    (appliedBenefit?.benefitId === 'decimo_corte' ||
                        appliedBenefit?.benefitId === 'corte_gratis' ||
                        String(appliedBenefit?.folio || '').startsWith('VA-CORTE')) &&
                    it.tipo === 'servicio' &&
                    it.discountType === 'fixed' &&
                    Number(it.discountValue) <= maxDecimaCov
                ) {
                    return { ...it, discountValue: '0', discountType: 'fixed' as const };
                }
                return it;
            });
        });
        appliedBirthdaySyncRef.current = '';
        setSelectedBirthdayOptionId('');
        setAppliedBenefit(null);
        setJuntosMinorsCount(0);
    }, [appliedBenefit, currentHaircutPrice, decimaConfig.cobertura_monto, referralConfig.descuento_amigo_pct]);

    const handleToggleVipMonthlyCourtesy = useCallback(() => {
        if (clientLevelInfo?.tierId !== 'vip') return;
        if (vipMonthlyUsedThisMonth) {
            toast({
                variant: 'destructive',
                title: 'Cortesía VIP Ya Utilizada',
                description: `Este cliente Alfa Black VIP ya canjeó su Barba Express gratis correspondiente a ${MONTH_NAMES_ES[new Date().getMonth()]}.`,
            });
            return;
        }
        if (vipMonthlyCourtesyApplied) {
            setCart(prev =>
                prev
                    .filter(it => !it.addedByVipMonthly)
                    .map(it =>
                        it.vipMonthlyCourtesyItem
                            ? { ...it, vipMonthlyCourtesyItem: false, discountValue: '0', discountType: 'fixed' as const }
                            : it
                    )
            );
            setVipMonthlyCourtesyApplied(false);
            return;
        }

        const isBeardService = (nameRaw: string, catRaw: string, isPkgFlag?: boolean) => {
            const name = (nameRaw || '').toLowerCase();
            const cat = (catRaw || '').toLowerCase();
            if (
                isPkgFlag ||
                cat.includes('paquete') ||
                cat.includes('combo') ||
                /^[1-5]\s+/i.test(name) ||
                name.includes('paquete') ||
                name.includes('combo')
            ) {
                return false;
            }
            return name.includes('barba express') || name.includes('delineado de barba') || name.includes('barba');
        };

        let existingIdx = cart.findIndex(
            it => it.tipo === 'servicio' && !it.birthdayDiscountApplied && (it.nombre || '').toLowerCase().includes('barba express')
        );
        if (existingIdx === -1) {
            existingIdx = cart.findIndex(
                it => it.tipo === 'servicio' && !it.birthdayDiscountApplied && isBeardService(it.nombre, '', false)
            );
        }

        if (existingIdx !== -1) {
            const targetUniqueId = cart[existingIdx].uniqueId;
            setCart(prev =>
                prev.map(it =>
                    it.uniqueId === targetUniqueId
                        ? { ...it, vipMonthlyCourtesyItem: true, discountValue: String(Math.max(0, Number(it.precio) || 0)), discountType: 'fixed' as const }
                        : it
                )
            );
            setVipMonthlyCourtesyApplied(true);
            toast({
                title: '👑 Cortesía Alfa Black VIP Aplicada',
                description: '1 Barba Express gratis (100% descuento) aplicada sobre el servicio en ticket.',
            });
            return;
        }

        const expressCatalog = services?.find((s: any) =>
            isBeardService(s.name, s.category, s.esPaquete || s.es_paquete) &&
            (s.name || '').toLowerCase().includes('barba express')
        );
        const anyBeardCatalog =
            expressCatalog ||
            services?.find((s: any) => isBeardService(s.name, s.category, s.esPaquete || s.es_paquete));

        if (!anyBeardCatalog) {
            toast({
                variant: 'destructive',
                title: 'Servicio Barba Express no encontrado',
                description: 'Agrega o configura un servicio individual de Barba Express en el catálogo para aplicar la cortesía.',
            });
            return;
        }

        const svcPrice = Math.max(0, Number(anyBeardCatalog.price) || 0);
        setCart(prev => [
            ...prev,
            {
                uniqueId: crypto.randomUUID(),
                id: anyBeardCatalog.id,
                nombre: anyBeardCatalog.name,
                precio: svcPrice,
                cantidad: 1,
                tipo: 'servicio',
                duracion: anyBeardCatalog.duration,
                addedByVipMonthly: true,
                vipMonthlyCourtesyItem: true,
                discountValue: String(svcPrice),
                discountType: 'fixed',
            },
        ]);
        setVipMonthlyCourtesyApplied(true);
        toast({
            title: '👑 Cortesía Alfa Black VIP Aplicada',
            description: '1 Barba Express gratis agregada al ticket del mes.',
        });
    }, [cart, clientLevelInfo?.tierId, vipMonthlyUsedThisMonth, vipMonthlyCourtesyApplied, services, toast]);

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
        const rawTel = String(selectedClient.telefono).trim();
        const cleanPhone = rawTel.replace(/\D/g, '');
        const fullPhone = !rawTel.startsWith('+') && cleanPhone.length === 10 ? `52${cleanPhone}` : cleanPhone;
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
            attemptedTerminalIdsRef.current.clear();
            setTransferPaymentLink('');
            setIsGeneratingTransferLink(false);
            setTransferLinkCopied(false);
            setBankDetailsCopied(false);
            setVipMonthlyCourtesyApplied(false);
            setUseWallet(Boolean((initialData as any)?.useWallet));
            setWalletCustomAmount(null);

            // Reset form fields that should not persist across sales
            form.setValue('metodo_pago', 'efectivo');
            form.setValue('pago_efectivo', 0);
            form.setValue('pago_tarjeta', 0);
            form.setValue('pago_transferencia', 0);
            form.setValue('propina', 0);
            if (!form.getValues('notas')) {
                form.setValue('notas', (initialData as any)?.notas || '');
            }

            const incomingPromo = (initialData as any)?.promoRedeemed;
            const incomingPromoPct = Number(
                incomingPromo?.descuento_porcentaje || incomingPromo?.descuento || incomingPromo?.discountPct || 0
            );
            if ((initialData as any)?.benefitRedeemed) {
                setAppliedBenefit((initialData as any).benefitRedeemed);
            } else if (incomingPromo) {
                setAppliedBenefit({
                    folio: incomingPromo?.codigo || (initialData as any)?.promoCode || 'PROMO-QR',
                    benefitTitle: incomingPromo?.titulo || incomingPromo?.title || incomingPromo?.nombre || 'Cupón Promocional',
                    benefitId: incomingPromo?.id || 'promo_cupon',
                    isPromoCoupon: true,
                    discount: incomingPromoPct,
                });
            } else {
                setAppliedBenefit(null);
            }

            if (initialData?.client?.id) {
                setSelectedClientId(initialData.client.id);
                form.setValue('cliente_id', initialData.client.id);
            } else {
                setSelectedClientId('');
                form.setValue('cliente_id', '');
            }
            if (initialData.local_id) {
                form.setValue('local_id', initialData.local_id);
            }
            setReservationId(prev => initialData.reservationId || (prev && (!initialData.items || initialData.items.length === 0) ? prev : undefined));
            const initialCartItems: CartItem[] = (initialData.items || []).map(item => {
                const tipo = 'duration' in item ? 'servicio' : 'producto';
                // Prioritize 'precio_original' or 'precio' over master price list
                const precio = (item as any).precio_original || (item as any).precio || (tipo === 'servicio' ? (item as ServiceType).price : (item as Product).public_price);
                const nombre = tipo === 'servicio' ? (item as ServiceType).name : (item as Product).nombre;
                const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;
                const rawDiscVal = (item as any).discountValue ?? (item as any).descuento_porcentaje;
                const shouldApplyPromo =
                    !(initialData as any)?.benefitRedeemed &&
                    incomingPromo &&
                    incomingPromoPct > 0 &&
                    tipo === 'servicio' &&
                    (!rawDiscVal || Number(rawDiscVal) <= 0);
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
                    duracion: (item as any).duracion || (item as any).duration || 0,
                    discountValue: shouldApplyPromo
                        ? String(incomingPromoPct)
                        : rawDiscVal !== undefined && Number(rawDiscVal) > 0
                        ? String(rawDiscVal)
                        : undefined,
                    discountType: shouldApplyPromo
                        ? ('percentage' as const)
                        : (item as any).discountType || (rawDiscVal !== undefined && Number(rawDiscVal) > 0 ? 'percentage' : undefined),
                    ...(shouldApplyPromo ? { promoDiscountApplied: true } : {}),
                };
            });
            if (initialCartItems.length > 0) {
                setCart(initialCartItems);
            } else {
                setCart(prev => (prev.length > 0 ? prev : []));
            }
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

            // Double security: If there is a reservationId, fetch reservation from DB to verify actual payment state and promotion discounts
            if (initialData.reservationId && db) {
                getDoc(doc(db, 'reservas', initialData.reservationId)).then(snap => {
                    if (snap.exists()) {
                        const res = snap.data();
                        const rawDbDeposit = Number(
                            res.anticipoPagado ||
                            res.anticipo_pagado ||
                            res.monto_pagado_real ||
                            res.monto_pagado ||
                            res.monto_anticipo ||
                            (res.total && res.saldo_pendiente !== undefined && Number(res.total) > Number(res.saldo_pendiente)
                                ? Math.max(0, Number(res.total) - Number(res.saldo_pendiente))
                                : 0) ||
                            0
                        );
                        const isResDepositPaid = Boolean(
                            rawDbDeposit > 0 &&
                            res.pago_estado !== 'pendiente_anticipo' &&
                            res.pago_estado !== 'pending_payment' &&
                            res.pago_estado !== 'Pendiente' &&
                            res.pago_estado !== 'pendiente'
                        );
                        const dbDeposit = isResDepositPaid ? rawDbDeposit : 0;
                        setAnticipoPagado(dbDeposit);

                        // Hydrate promotion discount from reservation if present
                        const resPromoPct = Number(res.descuento_porcentaje || 0);
                        const resDbItems = Array.isArray(res.items) ? res.items : [];
                        const hasItemDiscounts = resDbItems.some((it: any) => Number(it.discountValue || it.descuento_porcentaje || 0) > 0);
                        if (resPromoPct > 0 || hasItemDiscounts) {
                            setCart(prev => prev.map(cartIt => {
                                if (cartIt.tipo !== 'servicio') return cartIt;
                                const matchDbIt = resDbItems.find((dIt: any) => dIt.id === cartIt.id || dIt.nombre === cartIt.nombre);
                                const itemPct = Number(matchDbIt?.discountValue || matchDbIt?.descuento_porcentaje || resPromoPct || 0);
                                if (itemPct <= 0) return cartIt;
                                const origPrice = Number(matchDbIt?.precio_original || matchDbIt?.precio || cartIt.precio || 0);
                                return {
                                    ...cartIt,
                                    precio: origPrice > 0 ? origPrice : cartIt.precio,
                                    discountValue: String(itemPct),
                                    discountType: (matchDbIt?.discountType as 'fixed' | 'percentage') || 'percentage',
                                };
                            }));
                        }
                    }
                }).catch(console.error);
            }
            if ((initialData as any)?.benefitRedeemed) {
                setAppliedBenefit((initialData as any).benefitRedeemed);
                setJuntosMinorsCount(Number((initialData as any).benefitRedeemed?.minorsCount || 0));
            }
            const hasPreloadedItems = Array.isArray(initialData.items) && initialData.items.length > 0;
            setStep(prev => {
                if (initialData?.client?.id && (hasPreloadedItems || (cart && cart.length > 0))) return 2;
                if (initialData?.client?.id && hasPreloadedItems) return 2;
                return prev || 1;
            });
        }
    }, [initialData, form, isOpen, db]);

    // Aplicar QR escaneado directamente sobre la venta en curso sin reiniciar reserva, carrito ni datos
    useEffect(() => {
        if (!isOpen) return;
        const handleApplyQrToSale = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (!detail) return;
            if (detail.client?.id) {
                setSelectedClientId(detail.client.id);
                form.setValue('cliente_id', detail.client.id);
            }
            if (detail.useWallet) {
                setUseWallet(true);
                setWalletCustomAmount(null);
            }
            if (detail.benefitRedeemed) {
                setAppliedBenefit(detail.benefitRedeemed);
                setJuntosMinorsCount(Number(detail.benefitRedeemed?.minorsCount || 0));
            } else if (detail.promoRedeemed) {
                const p = detail.promoRedeemed;
                const promoPct = Number(p?.descuento_porcentaje || p?.descuento || p?.discountPct || 0);
                setAppliedBenefit({
                    folio: p?.codigo || detail.promoCode || 'PROMO-QR',
                    benefitTitle: p?.titulo || p?.title || p?.nombre || 'Cupón Promocional',
                    benefitId: p?.id || 'promo_cupon',
                    isPromoCoupon: true,
                    discount: promoPct,
                });
                if (promoPct > 0) {
                    setCart(prev =>
                        prev.map(it =>
                            it.tipo === 'servicio' && (!it.discountValue || Number(it.discountValue) <= 0)
                                ? {
                                      ...it,
                                      discountValue: String(promoPct),
                                      discountType: 'percentage' as const,
                                      promoDiscountApplied: true,
                                  }
                                : it
                        )
                    );
                }
            }
        };
        document.addEventListener('apply-qr-to-sale', handleApplyQrToSale);
        return () => document.removeEventListener('apply-qr-to-sale', handleApplyQrToSale);
    }, [isOpen, form]);


    const finalizeSaleProcess = async (clientId: string, localId: string, finalizedSaleId?: string) => {
        const targetClient = selectedClient || clients.find(c => c.id === clientId);
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const coinsMult = activeCoinsMultiplier?.multiplier || 1;

        const effectiveClientId = targetClient?.id || clientId;
        let liveClient: any = targetClient;
        if (db && effectiveClientId) {
            try {
                const freshClientSnap = await getDoc(doc(db, 'clientes', effectiveClientId));
                if (freshClientSnap.exists()) {
                    liveClient = { ...(targetClient || {}), ...freshClientSnap.data(), id: effectiveClientId };
                }
            } catch (e) {
                console.warn('No se pudo obtener el perfil en vivo del cliente antes de acreditar lealtad:', e);
            }
        }
        const liveHasApp = Boolean((liveClient && isClientWithApp(liveClient)) || hasAppDownloaded);

        const loyaltySnapshot: SaleLoyaltySnapshot = {
            aplicado: true,
            cliente_id: liveClient?.id || clientId || '',
            fecha_dia: todayStr,
            consumo_real_sumado: 0,
            visita_asistida_sumada: 0,
            prev_ultima_visita_fecha: String((liveClient as any)?.ultima_visita_fecha || ''),
            visita_elegible_sumada: 0,
            alfa_coins_ganados: 0,
            alfa_coins_canjeados: 0,
            multiplicador_aplicado: coinsMult,
            sellos_ganados: 0,
            corte_gratis_canjeado: false,
            prev_cortes_acumulados: Number(liveClient?.cortes_acumulados ?? liveClient?.cortesAcumulados ?? 0),
            prev_corte_gratis_disponible: Boolean((liveClient as any)?.corte_gratis_disponible),
            prev_ultimo_sello_fecha: String((liveClient as any)?.ultimo_sello_fecha ?? ''),
            beneficio_folio: appliedBenefit?.folio || undefined,
            beneficio_id: appliedBenefit?.benefitId || appliedBenefit?.id || undefined,
        };

        // 1. Actualizar Consumo Histórico ($ MXN), Visitas Históricas, Sellos, AlfaCoins y Nivel (Pase Alfa Club)
        if (db && liveClient) {
            try {
                const clientRef = doc(db, 'clientes', liveClient.id);
                const realMoneySpent = Math.max(
                    0,
                    Math.round((total + Number(anticipoPagado || 0) + Number(effectiveWalletAmountToUse || 0)) * 100) / 100
                );
                const hasServiceInCart = cart.some(it => it.tipo === 'servicio');
                const isFreeCutRedemption = Boolean(
                    appliedBenefit?.benefitId === 'decimo_corte' ||
                    appliedBenefit?.benefitId === 'corte_gratis' ||
                    appliedBenefit?.folio?.startsWith('VA-CORTE')
                );

                const alreadyCountedToday = (liveClient as any).ultima_visita_fecha === todayStr;
                const freeCutCountsAsVisit = decimaConfig.contar_como_visita_nivel === true;
                const visitDelta = (!isFreeCutRedemption || freeCutCountsAsVisit) && hasServiceInCart && !alreadyCountedToday ? 1 : 0;

                loyaltySnapshot.consumo_real_sumado = realMoneySpent;
                loyaltySnapshot.visita_asistida_sumada = visitDelta;
                loyaltySnapshot.corte_gratis_canjeado = isFreeCutRedemption;
                if ((effectiveWalletAmountToUse || 0) > 0) {
                    loyaltySnapshot.monedero_usado = effectiveWalletAmountToUse;
                }

                // Evaluar nivel antes y después de la compra actual
                const liveClientId = String(liveClient.id || effectiveClientId || '');
                const hasReconciledStats = Boolean(
                    reconciledClientStats && liveClientId && reconciledClientStats.clientId === liveClientId
                );
                const prevEvaluated = evaluateClientAlfaTier(liveClient, nivelesConfig, {
                    overrideVisits: hasReconciledStats ? reconciledClientStats!.visits : undefined,
                    overrideSpend: hasReconciledStats ? reconciledClientStats!.spend : undefined,
                    forceEvaluateWhenPaused: true,
                });

                const nextEvaluated = evaluateClientAlfaTier(liveClient, nivelesConfig, {
                    overrideVisits: prevEvaluated.visitasHistoricas + visitDelta,
                    overrideSpend: Math.round((prevEvaluated.consumoHistorico + realMoneySpent) * 100) / 100,
                    forceEvaluateWhenPaused: true,
                });

                loyaltySnapshot.prev_nivel = prevEvaluated.tierName;
                loyaltySnapshot.new_nivel = nextEvaluated.tierName;

                const updatePayload: Record<string, any> = {};

                // Los niveles y ascensos son exclusivos para usuarios que tienen la app móvil
                if (liveHasApp && nextEvaluated.tierName && nextEvaluated.tierName !== 'Sin Nivel') {
                    updatePayload.nivel = nextEvaluated.tierName;
                }

                if (realMoneySpent > 0) {
                    updatePayload.consumo_total = increment(realMoneySpent);
                    updatePayload.gasto_total = increment(realMoneySpent);
                    updatePayload.consumoTotal = increment(realMoneySpent);
                    updatePayload.ultima_visita = Timestamp.now();
                    updatePayload.ultima_visita_fecha = todayStr;
                    if (liveHasApp) {
                        updatePayload.consumo_pase_alfa = increment(realMoneySpent);
                    }
                }

                if (visitDelta > 0) {
                    updatePayload.citas_asistidas = increment(1);
                    updatePayload.citasAsistidas = increment(1);
                    updatePayload.visitas_totales = increment(1);
                    updatePayload.ultima_visita = Timestamp.now();
                    updatePayload.ultima_visita_fecha = todayStr;
                    if (liveHasApp) {
                        updatePayload.visitas_pase_alfa = increment(1);
                    }
                }

                // Si el cliente tiene la App descargada, actualizar también sus AlfaCoins y Sello del Pase Alfa
                if (liveHasApp) {
                    const coinsPerPeso = coinsConfig.activo !== false ? Math.max(0, Number(coinsConfig.coins_por_peso ?? 1)) : 0;
                    // Usar realMoneySpent (incluye anticipo/pago total online) para no perder Alfa Coins al pagar por adelantado
                    const pointsEarned = realMoneySpent > 0 && coinsPerPeso > 0 ? Math.floor(realMoneySpent * coinsPerPeso) * coinsMult : 0;
                    const pointsSpent = effectiveAlfaCoinsToUse || 0;
                    const deltaCoins = pointsEarned - pointsSpent;

                    loyaltySnapshot.alfa_coins_ganados = pointsEarned;
                    loyaltySnapshot.alfa_coins_canjeados = pointsSpent;

                    if (pointsEarned > 0 || pointsSpent > 0) {
                        updatePayload.puntos = increment(deltaCoins);
                        updatePayload.alfaCoins = increment(deltaCoins);
                        updatePayload.alfa_coins = increment(deltaCoins);
                        updatePayload.puntosLealtad = increment(deltaCoins);
                        updatePayload.puntos_lealtad = increment(deltaCoins);
                    }

                    const currStamps = Number(liveClient.cortes_acumulados ?? liveClient.cortesAcumulados ?? 0);
                    let nextStamps = currStamps;
                    let stampAdded = false;

                    const effectiveStampMinPrice =
                        decimaConfig.consumo_sello_tipo === 'monto_fijo' && Number(decimaConfig.consumo_sello_monto || 0) > 0
                            ? Number(decimaConfig.consumo_sello_monto)
                            : currentHaircutPrice;

                    const stampEvaluation = evaluatePaseAlfaStampsForSale({
                        client: liveClient,
                        hasAppDownloaded: true,
                        cart,
                        realMoneySpent,
                        currentHaircutPrice: effectiveStampMinPrice,
                        targetStamps: targetStampsConfig,
                        todayStr,
                        appliedBenefit,
                    });
                    const stampsToAward = stampEvaluation.stampsToAward;
                    loyaltySnapshot.sellos_ganados = isFreeCutRedemption ? 0 : stampsToAward;

                    if (isFreeCutRedemption) {
                        updatePayload.cortes_acumulados = 0;
                        updatePayload.cortesAcumulados = 0;
                        updatePayload.corte_gratis_disponible = false;
                        updatePayload.corteGratisDisponible = false;
                        updatePayload.ultimo_sello_fecha = (liveClient as any).ultimo_sello_fecha ?? '';
                        nextStamps = 0;
                    } else if (stampsToAward > 0) {
                        nextStamps = Math.min(targetStampsConfig, currStamps + stampsToAward);
                        updatePayload.cortes_acumulados = nextStamps;
                        updatePayload.cortesAcumulados = nextStamps;
                        updatePayload.corte_gratis_disponible = nextStamps >= targetStampsConfig;
                        updatePayload.corteGratisDisponible = nextStamps >= targetStampsConfig;
                        updatePayload.ultimo_sello_fecha = todayStr;
                        updatePayload.visitas_elegibles_historicas = increment(1);
                        loyaltySnapshot.visita_elegible_sumada = 1;
                        stampAdded = true;
                    } else {
                        if (
                            stampEvaluation.qualifyingServiceUnits > 0 &&
                            !stampEvaluation.alreadyStampedToday &&
                            realMoneySpent + 0.01 >= stampEvaluation.minServicePrice
                        ) {
                            updatePayload.visitas_elegibles_historicas = increment(1);
                            loyaltySnapshot.visita_elegible_sumada = 1;
                        }
                        // Preservar explícitamente el campo ('' si nunca ha acreditado sello hoy)
                        // para que un servicio menor (ej. ceja $30) o compra de producto no bloquee
                        // un corte elegible más tarde ese mismo día.
                        updatePayload.ultimo_sello_fecha = (liveClient as any).ultimo_sello_fecha ?? '';
                    }

                    const didLevelUp = Boolean(
                        nivelesConfig?.activo !== false &&
                        nextEvaluated.tierId !== prevEvaluated.tierId &&
                        (nextEvaluated.tierId === 'gold' || nextEvaluated.tierId === 'vip')
                    );

                    if (stampAdded || pointsEarned > 0 || didLevelUp) {
                        const prevCoins = Number(
                            liveClient.alfaCoins ??
                            liveClient.alfa_coins ??
                            liveClient.puntos_lealtad ??
                            liveClient.puntosLealtad ??
                            liveClient.puntos ??
                            0
                        );
                        const newCoinsTotal = Math.max(0, prevCoins + deltaCoins);
                        const rewardId = `reward_${Date.now()}`;
                        loyaltySnapshot.recompensa_pendiente_id = rewardId;
                        updatePayload.recompensa_pendiente = {
                            id: rewardId,
                            sello_agregado: stampAdded,
                            sellos_ganados: stampsToAward,
                            sellos_anteriores: currStamps,
                            sellos_actuales: nextStamps,
                            meta_sellos: targetStampsConfig,
                            corte_gratis_desbloqueado: nextStamps >= targetStampsConfig,
                            coins_ganadas: pointsEarned,
                            multiplicador_aplicado: coinsMult,
                            coins_anteriores: prevCoins,
                            coins_actuales: newCoinsTotal,
                            nivel_ascendido: didLevelUp,
                            nivel_anterior: prevEvaluated.tierName,
                            nivel_nuevo: nextEvaluated.tierName,
                            nivel_nuevo_id: nextEvaluated.tierId,
                            fecha: new Date().toISOString(),
                        };
                    }
                }

                // Transacción atómica cuando se gastan Alfa Coins o se canjea 10.° Corte Gratis (previene double spending)
                const needsAtomicGuard = (effectiveAlfaCoinsToUse || 0) > 0 || isFreeCutRedemption;
                if (needsAtomicGuard) {
                    await runTransaction(db, async (tx) => {
                        const freshSnap = await tx.get(clientRef);
                        if (!freshSnap.exists()) return;
                        const freshData = freshSnap.data() || {};
                        const spent = effectiveAlfaCoinsToUse || 0;
                        if (spent > 0) {
                            const liveCoins = Number(
                                freshData.alfaCoins ?? freshData.alfa_coins ?? freshData.puntosLealtad ?? freshData.puntos_lealtad ?? freshData.puntos ?? 0
                            );
                            if (liveCoins < spent) {
                                throw new Error(`Saldo insuficiente de Alfa Coins en servidor (${liveCoins} disponibles vs ${spent} solicitados).`);
                            }
                        }
                        tx.update(clientRef, updatePayload);
                    });
                } else {
                    await updateDoc(clientRef, updatePayload);
                }

                // Notificar en Recepción si el cliente subió de nivel automáticamente y los niveles están activos
                if (
                    nivelesConfig?.activo !== false &&
                    nextEvaluated.tierId !== prevEvaluated.tierId &&
                    (nextEvaluated.tierId === 'gold' || nextEvaluated.tierId === 'vip')
                ) {
                    toast({
                        title: `🏆 ¡Ascenso Automático a ${nextEvaluated.tierName}!`,
                        description: `${liveClient.nombre || 'El cliente'} ha alcanzado ${nextEvaluated.visitasHistoricas} visitas / $${formatMoney(nextEvaluated.consumoHistorico)} MXN y ahora disfruta de ${nextEvaluated.cashbackPct}% Cashback y privilegios ${nextEvaluated.tierName}.`,
                    });
                }
            } catch (e) {
                console.error("Error updating client loyalty & tier in Firestore:", e);
                loyaltySnapshot.aplicado = false;
                loyaltySnapshot.sellos_ganados = 0;
                loyaltySnapshot.alfa_coins_ganados = 0;
                loyaltySnapshot.recompensa_pendiente_id = undefined;
                toast({
                    variant: 'destructive',
                    title: 'Error al actualizar Pase Alfa',
                    description: 'La venta se guardó, pero no se pudieron acreditar sellos/Alfa Coins en el perfil del cliente.',
                });
            }
        }

        // Cortesía Mensual Alfa Black VIP: 1 Barba Express gratis por mes calendario (atómico por cliente y mes)
        if (
            vipMonthlyCourtesyApplied &&
            cart.some(it => it.vipMonthlyCourtesyItem) &&
            clientLevelInfo?.tierId === 'vip' &&
            liveClient?.id &&
            db
        ) {
            try {
                const vipFolio = `VA-VIP-MES-${currentYearMonth}-${liveClient.id}`;
                const vipDocRef = doc(db, 'canjes_beneficios', vipFolio);
                const clientVipRef = doc(db, 'clientes', liveClient.id);
                const prevVipMonth = String((liveClient as any)?.ultimo_canje_cortesia_vip_mes || '');

                await runTransaction(db, async (tx) => {
                    const [cSnap, vSnap] = await Promise.all([tx.get(clientVipRef), tx.get(vipDocRef)]);
                    const cData = cSnap.exists() ? cSnap.data() || {} : {};
                    const vData = vSnap.exists() ? vSnap.data() || {} : null;
                    if (
                        String(cData.ultimo_canje_cortesia_vip_mes || '') === currentYearMonth ||
                        (vData && String(vData.estado || '') !== 'cancelado')
                    ) {
                        throw new Error(`El cliente ya utilizó su Barba Express de cortesía en ${currentYearMonth}.`);
                    }
                    tx.set(vipDocRef, {
                        folio: vipFolio,
                        benefitId: 'cortesia_vip_mensual',
                        benefitTitle: 'Cortesía Mensual Alfa Black VIP (1 Barba Express Gratis)',
                        estado: 'canjeado',
                        utilizado_en_venta: true,
                        pagado: true,
                        clienteId: liveClient.id,
                        cliente_id: liveClient.id,
                        clienteNombre: `${liveClient.nombre || ''} ${liveClient.apellido || ''}`.trim(),
                        mes: currentYearMonth,
                        ...(finalizedSaleId ? { ventaId: finalizedSaleId } : {}),
                        fecha_aplicacion: Timestamp.now(),
                    }, { merge: true });
                    tx.update(clientVipRef, {
                        ultimo_canje_cortesia_vip_mes: currentYearMonth,
                        ultimo_canje_cortesia_vip_folio: vipFolio,
                        fecha_ultimo_canje_cortesia_vip: Timestamp.now(),
                    });
                });

                loyaltySnapshot.is_vip_monthly_courtesy_applied = true;
                loyaltySnapshot.vip_monthly_courtesy_month = currentYearMonth;
                loyaltySnapshot.vip_monthly_courtesy_folio = vipFolio;
                loyaltySnapshot.prev_ultimo_canje_cortesia_vip_mes = prevVipMonth;
                setVipMonthlyUsedThisMonth(true);
            } catch (vipErr: any) {
                console.warn('Error registrando cortesía VIP mensual:', vipErr);
                toast({
                    variant: 'destructive',
                    title: 'Cortesía VIP no registrada',
                    description: vipErr?.message || 'No se pudo bloquear el canje mensual VIP.',
                });
            }
        }

        if (appliedBenefit?.isJuntosBenefit && selectedClient && db) {
            try {
                const effPrice =
                    juntosConfig?.consumo_minimo_tipo === 'monto_fijo'
                        ? Number(juntosConfig?.consumo_minimo_monto) || currentHaircutPrice || 140
                        : currentHaircutPrice || 140;
                const juntosCoins = Number(juntosConfig?.coins_por_persona) || JUNTOS_REWARD_COINS_PER_PERSON;
                const mode = appliedBenefit.juntosMode || 'minors';
                const companionsList = Array.isArray(appliedBenefit.companions) ? appliedBenefit.companions : [];
                const servicesCountInCart = cart.reduce((acc, it) => acc + (it.tipo === 'servicio' ? Number(it.cantidad || 1) : 0), 0);

                const countMinors = mode === 'minors' ? Math.max(1, Number(juntosMinorsCount || 1)) : 0;
                const participantsInTicket =
                    mode === 'minors'
                        ? 1 + countMinors
                        : mode === 'companions_single_ticket'
                        ? 1 + Math.max(1, companionsList.length)
                        : 1; // companions_separate_tickets

                const reqMin = Math.round(effPrice * participantsInTicket * 100) / 100;
                const effectiveMoneyPaid = total + Number(anticipoPagado || 0) + Number(effectiveWalletAmountToUse || 0);
                const isAmountMet = effectiveMoneyPaid >= reqMin;
                const isServicesMet = servicesCountInCart >= participantsInTicket;
                const isMet = isAmountMet && isServicesMet;

                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                let totalBonusCoinsCredited = 0;
                let separateTicketsStillPending = false;
                const companionsAwardedForSnapshot: { id: string; coins: number; folio?: string }[] = [];
                loyaltySnapshot.is_juntos_applied = true;
                loyaltySnapshot.juntos_mode = mode;
                loyaltySnapshot.prev_ultimo_canje_juntos_fecha = String((selectedClient as any).ultimo_canje_juntos_fecha || '');

                const creditJuntosBonusToMember = async (
                    memberId: string,
                    bonusAmount: number,
                    mergeIntoExistingSaleReward: boolean
                ) => {
                    const cRef = doc(db, 'clientes', memberId);
                    const cSnap = await getDoc(cRef);
                    const cData: any = cSnap.exists() ? cSnap.data() : {};
                    const prevCoins = Number(
                        cData.alfaCoins ??
                            cData.alfa_coins ??
                            cData.puntos_lealtad ??
                            cData.puntosLealtad ??
                            cData.puntos ??
                            0
                    );
                    const currStamps = Number(cData.cortes_acumulados ?? cData.cortesAcumulados ?? 0);
                    const nowIso = new Date().toISOString();

                    let nextPendingReward: Record<string, any>;
                    if (
                        mergeIntoExistingSaleReward &&
                        cData.recompensa_pendiente &&
                        cData.recompensa_pendiente.id === loyaltySnapshot.recompensa_pendiente_id
                    ) {
                        nextPendingReward = {
                            ...cData.recompensa_pendiente,
                            coins_ganadas: Number(cData.recompensa_pendiente.coins_ganadas || 0) + bonusAmount,
                            coins_actuales: Number(cData.recompensa_pendiente.coins_actuales || prevCoins) + bonusAmount,
                            juntos_bonus_coins: bonusAmount,
                            fecha: nowIso,
                        };
                    } else {
                        nextPendingReward = {
                            id: `reward_juntos_${Date.now()}_${memberId.slice(-4)}`,
                            tipo_recompensa: 'juntos_es_mejor',
                            sello_agregado: false,
                            sellos_ganados: 0,
                            sellos_anteriores: currStamps,
                            sellos_actuales: currStamps,
                            meta_sellos: targetStampsConfig,
                            corte_gratis_desbloqueado: Boolean(cData.corte_gratis_disponible),
                            coins_ganadas: bonusAmount,
                            coins_anteriores: prevCoins,
                            coins_actuales: prevCoins + bonusAmount,
                            fecha: nowIso,
                        };
                    }

                    await updateDoc(cRef, {
                        puntos: increment(bonusAmount),
                        alfaCoins: increment(bonusAmount),
                        alfa_coins: increment(bonusAmount),
                        puntosLealtad: increment(bonusAmount),
                        puntos_lealtad: increment(bonusAmount),
                        ultimo_canje_juntos_fecha: todayStr,
                        recompensa_pendiente: nextPendingReward,
                    });
                };

                if (isMet) {
                    if (mode === 'companions_single_ticket' && companionsList.length > 0) {
                        // Acreditar al titular y a cada acompañante verificado en su propia cuenta
                        const titularCoins = juntosCoins;
                        await creditJuntosBonusToMember(selectedClient.id, titularCoins, true);
                        totalBonusCoinsCredited += titularCoins;
                        loyaltySnapshot.juntos_titular_coins_awarded = titularCoins;

                        for (const comp of companionsList) {
                            if (comp?.id && comp.id !== selectedClient.id) {
                                await creditJuntosBonusToMember(comp.id, juntosCoins, false);
                                totalBonusCoinsCredited += juntosCoins;
                                companionsAwardedForSnapshot.push({
                                    id: comp.id,
                                    coins: juntosCoins,
                                    folio: comp.folio || undefined,
                                });
                                if (comp.folio && comp.folio !== appliedBenefit.folio) {
                                    await setDoc(doc(db, 'canjes_beneficios', comp.folio), {
                                        folio: comp.folio,
                                        benefitId: 'juntos_es_mejor',
                                        benefitTitle: 'JUNTOS ES MEJOR',
                                        estado: 'canjeado',
                                        utilizado_en_venta: true,
                                        pagado: true,
                                        fecha_aplicacion: Timestamp.now(),
                                        canjeadoEn: Timestamp.now(),
                                        fechaCanje: Timestamp.now(),
                                        fecha_canje_dia: todayStr,
                                        fechaStr: todayStr,
                                        anio: now.getFullYear(),
                                        clienteId: comp.id,
                                        clienteNombre: comp.name || '',
                                        isJuntosBenefit: true,
                                        juntosMode: 'companions_single_ticket',
                                        sucursal: 'Sombrerete',
                                        ...(finalizedSaleId ? { ventaId: finalizedSaleId } : {}),
                                        rewardCoins: juntosCoins,
                                        recompensaAcreditada: true,
                                    }, { merge: true });
                                }
                            }
                        }
                        loyaltySnapshot.juntos_companions_awarded = companionsAwardedForSnapshot;

                        toast({
                            title: '🪙 ¡Alfa Coins Acreditados al Grupo!',
                            description: `Se abonaron +${juntosCoins} Alfa Coins a ${selectedClient.nombre} y +${juntosCoins} a cada uno de sus ${companionsList.length} acompañante(s).`,
                        });
                    } else if (mode === 'companions_separate_tickets') {
                        // Cobro separado en grupo: si retener_coins_tickets_separados es false, acreditar al instante; si es true (default), esperar a que TODOS paguen hoy
                        if (juntosConfig?.retener_coins_tickets_separados === false) {
                            await creditJuntosBonusToMember(selectedClient.id, juntosCoins, true);
                            totalBonusCoinsCredited = juntosCoins;
                            loyaltySnapshot.juntos_titular_coins_awarded = juntosCoins;

                            toast({
                                title: '🪙 ¡Alfa Coins por Juntos es Mejor!',
                                description: `Se abonaron +${juntosCoins} Alfa Coins a la cuenta de ${selectedClient.nombre}.`,
                            });
                        } else {
                            const myGrpDocId = `VA-JUNTOS-GRP-${todayStr}-${selectedClient.id}`;
                            await setDoc(doc(db, 'canjes_beneficios', myGrpDocId), {
                                folio: myGrpDocId,
                                pagado: true,
                                utilizado_en_venta: true,
                                fecha_pago: Timestamp.now(),
                                fecha_canje_dia: todayStr,
                                totalVenta: total,
                                ...(finalizedSaleId ? { ventaId: finalizedSaleId } : {}),
                            }, { merge: true });

                            const myGrpSnap = await getDoc(doc(db, 'canjes_beneficios', myGrpDocId));
                            const rawMembers: { id: string; nombre?: string; name?: string }[] =
                                myGrpSnap.exists() && Array.isArray(myGrpSnap.data()?.grupoMiembros) && myGrpSnap.data()!.grupoMiembros.length > 0
                                    ? myGrpSnap.data()!.grupoMiembros
                                    : companionsList.length > 0
                                    ? companionsList
                                    : [{ id: selectedClient.id, nombre: selectedClient.nombre }];

                            const memberSnaps = await Promise.all(
                                rawMembers.map(async m => {
                                    const mDocId = `VA-JUNTOS-GRP-${todayStr}-${m.id}`;
                                    const mSnap = await getDoc(doc(db, 'canjes_beneficios', mDocId));
                                    return {
                                        id: m.id,
                                        nombre: m.nombre || m.name || 'Integrante',
                                        docId: mDocId,
                                        data: mSnap.exists() ? mSnap.data() : {},
                                    };
                                })
                            );

                            const paidCount = memberSnaps.filter(m => m.id === selectedClient.id || m.data?.pagado === true).length;
                            const allPaid = memberSnaps.length > 0 && paidCount === memberSnaps.length;

                            if (!allPaid) {
                                separateTicketsStillPending = true;
                                loyaltySnapshot.juntos_group_pending = true;
                                loyaltySnapshot.juntos_titular_coins_awarded = 0;

                                toast({
                                    title: `⏳ Pago de Grupo Registrado (${paidCount}/${memberSnaps.length})`,
                                    description: `Se registró el pago de ${selectedClient.nombre}. Los +${juntosCoins} Alfa Coins de cada integrante se acreditarán automáticamente cuando paguen los demás miembros hoy.`,
                                });
                            } else {
                                for (const member of memberSnaps) {
                                    if (member.data?.recompensaAcreditada) continue;
                                    const isCurrentSaleClient = member.id === selectedClient.id;
                                    await creditJuntosBonusToMember(member.id, juntosCoins, isCurrentSaleClient);

                                    const origFolio = member.data?.originalFolio ? String(member.data.originalFolio) : '';
                                    const canonicalMemberFolio = origFolio && origFolio !== member.docId ? origFolio : member.docId;
                                    const memberVentaId = isCurrentSaleClient
                                        ? (finalizedSaleId || member.data?.ventaId || null)
                                        : (member.data?.ventaId || null);

                                    // Consolidar en UN SOLO documento canónico (preferentemente el folio QR original del miembro)
                                    // y eliminar el registro temporal VA-JUNTOS-GRP-* para no duplicar canjes en la ficha.
                                    await setDoc(doc(db, 'canjes_beneficios', canonicalMemberFolio), {
                                        folio: canonicalMemberFolio,
                                        benefitId: 'juntos_es_mejor',
                                        benefitTitle: 'JUNTOS ES MEJOR',
                                        isJuntosBenefit: true,
                                        juntosMode: 'companions_separate_tickets',
                                        ...(member.data?.grupoId ? { grupoId: member.data.grupoId } : {}),
                                        ...(Array.isArray(member.data?.grupoMiembros) ? { grupoMiembros: member.data.grupoMiembros } : {}),
                                        ...(member.data?.grupoTitularId ? { grupoTitularId: member.data.grupoTitularId } : {}),
                                        ...(member.data?.grupoTitularNombre ? { grupoTitularNombre: member.data.grupoTitularNombre } : {}),
                                        ...(member.data?.telefono ? { telefono: member.data.telefono } : {}),
                                        sucursal: member.data?.sucursal || 'Sombrerete',
                                        fechaStr: member.data?.fechaStr || todayStr,
                                        anio: member.data?.anio || now.getFullYear(),
                                        ...(memberVentaId ? { ventaId: memberVentaId } : {}),
                                        clienteId: member.id,
                                        clienteNombre: member.nombre,
                                        estado: 'canjeado',
                                        utilizado_en_venta: true,
                                        pagado: true,
                                        fecha_aplicacion: Timestamp.now(),
                                        canjeadoEn: Timestamp.now(),
                                        fechaCanje: Timestamp.now(),
                                        fecha_canje_dia: todayStr,
                                        rewardCoins: juntosCoins,
                                        recompensaAcreditada: true,
                                    }, { merge: true });

                                    if (canonicalMemberFolio !== member.docId) {
                                        await deleteDoc(doc(db, 'canjes_beneficios', member.docId)).catch(() => {});
                                    }

                                    // Si este integrante pagó previamente antes de cerrar el grupo (caso mixto), actualizar su venta previa para permitir reversión
                                    if (!isCurrentSaleClient && member.data?.ventaId) {
                                        try {
                                            const prevSaleRef = doc(db, 'ventas', member.data.ventaId);
                                            const prevSaleSnap = await getDoc(prevSaleRef);
                                            if (prevSaleSnap.exists()) {
                                                const prevLoyalty = prevSaleSnap.data()?.lealtad_aplicada || {};
                                                await updateDoc(prevSaleRef, {
                                                    beneficio_aplicado: 'JUNTOS ES MEJOR',
                                                    beneficio_folio: canonicalMemberFolio,
                                                    lealtad_aplicada: {
                                                        ...prevLoyalty,
                                                        is_juntos_applied: true,
                                                        juntos_mode: 'companions_separate_tickets',
                                                        beneficio_folio: canonicalMemberFolio,
                                                        juntos_titular_coins_awarded: juntosCoins,
                                                    },
                                                });
                                            }
                                        } catch (_) {}
                                    }

                                    totalBonusCoinsCredited += juntosCoins;
                                    if (isCurrentSaleClient) {
                                        loyaltySnapshot.beneficio_folio = canonicalMemberFolio;
                                        loyaltySnapshot.juntos_titular_coins_awarded = juntosCoins;
                                    } else {
                                        companionsAwardedForSnapshot.push({
                                            id: member.id,
                                            coins: juntosCoins,
                                            folio: canonicalMemberFolio,
                                        });
                                    }
                                }
                                if (companionsAwardedForSnapshot.length > 0) {
                                    loyaltySnapshot.juntos_companions_awarded = companionsAwardedForSnapshot;
                                }

                                toast({
                                    title: '🪙 ¡Grupo Juntos es Mejor Completado!',
                                    description: `Todos los integrantes completaron su pago hoy. Se abonaron +${juntosCoins} Alfa Coins a cada cuenta (${memberSnaps.map(m => m.nombre).join(', ')}).`,
                                });
                            }
                        }
                    } else {
                        // Modalidad Hijos Menores sin App: juntosCoins * (1 + N) todo a la cuenta del papá/mamá
                        const bonusCoins = juntosCoins * (1 + Math.max(0, countMinors));
                        await creditJuntosBonusToMember(selectedClient.id, bonusCoins, true);
                        totalBonusCoinsCredited = bonusCoins;
                        loyaltySnapshot.juntos_titular_coins_awarded = bonusCoins;

                        toast({
                            title: '🪙 ¡Alfa Coins por Juntos es Mejor!',
                            description: `Se abonaron +${bonusCoins} Alfa Coins a la cuenta de ${selectedClient.nombre} (Titular + ${countMinors} menor(es)).`,
                        });
                    }
                }

                // Cuando companions_separate_tickets completó todo el grupo con retención activa, cada integrante
                // ya quedó consolidado arriba en su folio canónico individual sin sobrescribir ni duplicar.
                const alreadyConsolidatedSeparate =
                    isMet &&
                    mode === 'companions_separate_tickets' &&
                    juntosConfig?.retener_coins_tickets_separados !== false &&
                    !separateTicketsStillPending;

                if (!alreadyConsolidatedSeparate) {
                    let folio = appliedBenefit.folio || `VA-JUNTOS-${Date.now().toString().slice(-6)}`;
                    if (
                        mode === 'companions_separate_tickets' &&
                        juntosConfig?.retener_coins_tickets_separados === false &&
                        folio.startsWith('VA-JUNTOS-GRP-')
                    ) {
                        const grpSnap = await getDoc(doc(db, 'canjes_beneficios', folio));
                        const orig = grpSnap.exists() ? String(grpSnap.data()?.originalFolio || '') : '';
                        if (orig && orig !== folio) {
                            await deleteDoc(doc(db, 'canjes_beneficios', folio)).catch(() => {});
                            folio = orig;
                        }
                    }

                    loyaltySnapshot.beneficio_folio = folio;
                    const keepPending = separateTicketsStillPending || (!isMet && mode === 'companions_separate_tickets');
                    await setDoc(doc(db, 'canjes_beneficios', folio), {
                        folio,
                        benefitId: 'juntos_es_mejor',
                        benefitTitle: 'JUNTOS ES MEJOR',
                        estado: keepPending ? 'pendiente_cobro_grupo' : 'canjeado',
                        utilizado_en_venta: !keepPending,
                        pagado: isMet,
                        fecha_aplicacion: Timestamp.now(),
                        ...(!keepPending ? { canjeadoEn: Timestamp.now(), fechaCanje: Timestamp.now() } : {}),
                        fecha_canje_dia: todayStr,
                        fechaStr: todayStr,
                        anio: now.getFullYear(),
                        sucursal: 'Sombrerete',
                        ...(finalizedSaleId ? { ventaId: finalizedSaleId } : {}),
                        clienteId: clientId || selectedClient.id,
                        clienteNombre: `${selectedClient.nombre} ${selectedClient.apellido || ''}`.trim(),
                        totalVenta: total,
                        isJuntosBenefit: true,
                        juntosMode: mode,
                        minorsCount: countMinors,
                        companionsCount: companionsList.length,
                        haircutPriceApplied: effPrice,
                        requiredMinPurchase: reqMin,
                        rewardCoins: loyaltySnapshot.juntos_titular_coins_awarded ?? totalBonusCoinsCredited,
                        recompensaAcreditada: keepPending ? false : isMet,
                    }, { merge: true });
                }
            } catch (e) {
                console.error("Error updating canjes_beneficios for Juntos es Mejor:", e);
            }
        }

        if (appliedBenefit?.folio && db && !appliedBenefit?.isReferralBlocked && !appliedBenefit?.isJuntosBenefit && !appliedBenefit?.isBlocked) {
            try {
                const currentYear = new Date().getFullYear();
                const targetClientIdForBenefit = clientId || selectedClient?.id || null;
                const isBirthdayApplied = Boolean(
                    appliedBenefit.isBirthdayBenefit ||
                    appliedBenefit.benefitId === 'regalo_cumpleanos' ||
                    String(appliedBenefit.folio || '').includes('CUMPLE') ||
                    String(appliedBenefit.benefitTitle || '').toLowerCase().includes('cumple')
                );
                const invitedFriendName = selectedClient
                    ? `${selectedClient.nombre} ${selectedClient.apellido || ''}`.trim()
                    : '';
                const dynamicRefDiscountPct = Math.max(1, Math.min(100, Number(referralConfig.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT)));
                const dynamicRefHostCoins = Math.max(0, Number(referralConfig.recompensa_anfitrion_coins ?? REFERRAL_HOST_REWARD_COINS));
                const refMinBase = referralConfig.consumo_minimo_tipo === 'monto_fijo'
                    ? Math.max(1, Number(referralConfig.consumo_minimo_monto) || currentHaircutPrice || 140)
                    : (currentHaircutPrice || 140);
                const referralEval = evaluateReferralPurchaseEligibility({
                    subtotal: Number(subtotal || 0),
                    realMoneyPaid: Math.max(
                        0,
                        Math.round((Number(total || 0) + Number(anticipoPagado || 0) + Number(effectiveWalletAmountToUse || 0)) * 100) / 100
                    ),
                    currentHaircutPrice: refMinBase,
                    cart,
                    discountPercent: dynamicRefDiscountPct,
                });
                const isEligibleReferralReward =
                    Boolean(appliedBenefit.isReferralBenefit) &&
                    Boolean(appliedBenefit.referrerId) &&
                    appliedBenefit.referrerId !== clientId &&
                    referralEval.isEligible;

                const bdayEval = isBirthdayApplied
                    ? evaluateClientAlfaTier(liveClient || targetClient, nivelesConfig, { forceEvaluateWhenPaused: true })
                    : null;
                const bdayTierId = ((bdayEval?.tierId || clientLevelInfo?.tierId || 'member') as 'member' | 'gold' | 'vip');
                const bdayOpts = isBirthdayApplied ? resolveClientBirthdayGifts(bdayTierId, cumpleanosConfig) : [];
                const selectedBirthdayOpt = isBirthdayApplied
                    ? (bdayOpts.find(o => o.id === (selectedBirthdayOptionId || appliedBenefit?.birthdayOptionId)) || bdayOpts[0] || null)
                    : null;

                loyaltySnapshot.beneficio_folio = appliedBenefit.folio;
                loyaltySnapshot.is_birthday_applied = isBirthdayApplied;
                if (isBirthdayApplied) {
                    loyaltySnapshot.cumpleanos_anio_marcado = currentYear;
                    if (selectedBirthdayOpt) {
                        loyaltySnapshot.birthday_option_id = selectedBirthdayOpt.id;
                        loyaltySnapshot.birthday_option_title = selectedBirthdayOpt.titulo;
                    }
                }

                if (appliedBenefit.isReferralBenefit) {
                    loyaltySnapshot.is_referral_applied = true;
                    loyaltySnapshot.referrer_id = appliedBenefit.referrerId || undefined;
                    loyaltySnapshot.referrer_coins_awarded = isEligibleReferralReward ? dynamicRefHostCoins : 0;
                }

                const benefitFolioRef = doc(db, 'canjes_beneficios', appliedBenefit.folio);
                const birthdayClientRef = isBirthdayApplied && targetClientIdForBenefit
                    ? doc(db, 'clientes', targetClientIdForBenefit)
                    : null;

                const awardedBirthdayCoinsInTx = await runTransaction(db, async (tx) => {
                    const [folioSnap, bdayClientSnap] = await Promise.all([
                        tx.get(benefitFolioRef),
                        birthdayClientRef ? tx.get(birthdayClientRef) : Promise.resolve(null),
                    ]);
                    if (folioSnap.exists() && folioSnap.data()?.estado === 'canjeado' && folioSnap.data()?.utilizado_en_venta === true) {
                        throw new Error(`El folio ${appliedBenefit.folio} ya fue canjeado en otra venta.`);
                    }

                    const prevCreditedBdayCoins = Number(folioSnap.exists() ? folioSnap.data()?.coins_acreditadas || 0 : 0);
                    const birthdayCoinsToAward =
                        isBirthdayApplied &&
                        liveHasApp &&
                        selectedBirthdayOpt?.tipo === 'alfa_coins' &&
                        prevCreditedBdayCoins <= 0
                            ? Math.max(0, Math.round(Number(selectedBirthdayOpt.coinsCantidad || 0)))
                            : 0;

                    tx.set(benefitFolioRef, {
                        folio: appliedBenefit.folio,
                        benefitId: isBirthdayApplied ? 'regalo_cumpleanos' : (appliedBenefit.benefitId || 'beneficio_alfa'),
                        benefitTitle: appliedBenefit.benefitTitle || 'Beneficio Pase Alfa',
                        estado: 'canjeado',
                        anio: currentYear,
                        utilizado_en_venta: true,
                        canjeadoEn: Timestamp.now(),
                        fechaCanje: Timestamp.now(),
                        fecha_aplicacion: Timestamp.now(),
                        clienteId: targetClientIdForBenefit,
                        clienteNombre: invitedFriendName || null,
                        totalVenta: total,
                        ...(isBirthdayApplied ? {
                            isBirthdayBenefit: true,
                            tierId: bdayTierId,
                            ...(selectedBirthdayOpt ? {
                                benefitOptionId: selectedBirthdayOpt.id,
                                benefitOptionTitle: selectedBirthdayOpt.titulo,
                                benefitOptionType: selectedBirthdayOpt.tipo,
                            } : {}),
                            coins_acreditadas: birthdayCoinsToAward > 0 ? birthdayCoinsToAward : prevCreditedBdayCoins,
                        } : {}),
                        ...(appliedBenefit.isReferralBenefit ? {
                            isReferralBenefit: true,
                            referralCode: appliedBenefit.referralCode || null,
                            referrerId: appliedBenefit.referrerId || null,
                            referrerName: appliedBenefit.referrerName || null,
                            discountPercentApplied: dynamicRefDiscountPct,
                            haircutPriceApplied: referralEval.requiredGrossService,
                            requiredMinNetPaid: referralEval.requiredNetPaid,
                            rewardCoins: isEligibleReferralReward ? dynamicRefHostCoins : 0,
                            recompensaAcreditada: isEligibleReferralReward,
                        } : {})
                    }, { merge: true });

                    if (isBirthdayApplied && birthdayClientRef) {
                        const bdayUpdate: Record<string, any> = {
                            ultimo_canje_cumpleanos_anio: currentYear,
                            ultimo_canje_cumpleanos_folio: appliedBenefit.folio,
                            fecha_ultimo_canje_cumpleanos: Timestamp.now(),
                            actualizado_en: Timestamp.now(),
                        };
                        if (birthdayCoinsToAward > 0 && bdayClientSnap?.exists()) {
                            const cData: any = bdayClientSnap.data() || {};
                            const prevCoins = Number(
                                cData.alfaCoins ?? cData.alfa_coins ?? cData.puntos_lealtad ?? cData.puntosLealtad ?? cData.puntos ?? 0
                            );
                            const currStamps = Number(cData.cortes_acumulados ?? cData.cortesAcumulados ?? 0);
                            const existingPending = cData.recompensa_pendiente;
                            const mergeSameSaleReward = Boolean(
                                existingPending &&
                                loyaltySnapshot.recompensa_pendiente_id &&
                                existingPending.id === loyaltySnapshot.recompensa_pendiente_id
                            );
                            bdayUpdate.puntos = increment(birthdayCoinsToAward);
                            bdayUpdate.alfaCoins = increment(birthdayCoinsToAward);
                            bdayUpdate.alfa_coins = increment(birthdayCoinsToAward);
                            bdayUpdate.puntosLealtad = increment(birthdayCoinsToAward);
                            bdayUpdate.puntos_lealtad = increment(birthdayCoinsToAward);
                            bdayUpdate.recompensa_pendiente = mergeSameSaleReward
                                ? {
                                    ...existingPending,
                                    coins_ganadas: Number(existingPending.coins_ganadas || 0) + birthdayCoinsToAward,
                                    coins_actuales: Number(existingPending.coins_actuales || prevCoins) + birthdayCoinsToAward,
                                    cumpleanos_coins: birthdayCoinsToAward,
                                    fecha: new Date().toISOString(),
                                }
                                : {
                                    id: `reward_bday_${Date.now()}`,
                                    tipo_recompensa: 'cumpleanos',
                                    sello_agregado: false,
                                    sellos_ganados: 0,
                                    sellos_anteriores: currStamps,
                                    sellos_actuales: currStamps,
                                    meta_sellos: targetStampsConfig,
                                    corte_gratis_desbloqueado: Boolean(cData.corte_gratis_disponible),
                                    coins_ganadas: birthdayCoinsToAward,
                                    coins_anteriores: prevCoins,
                                    coins_actuales: prevCoins + birthdayCoinsToAward,
                                    fecha: new Date().toISOString(),
                                };
                        }
                        tx.update(birthdayClientRef, bdayUpdate);
                    }

                    return birthdayCoinsToAward;
                });

                if (awardedBirthdayCoinsInTx > 0) {
                    loyaltySnapshot.birthday_coins_awarded = awardedBirthdayCoinsInTx;
                    toast({
                        title: '🎂 ¡Regalo de Cumpleaños Acreditado!',
                        description: `Se abonaron +${awardedBirthdayCoinsInTx} Alfa Coins al perfil del cliente por su cumpleaños.`,
                    });
                }

                // Marcar al cliente nuevo como referido para impedir que vuelva a usar otro código en el futuro
                if (appliedBenefit.isReferralBenefit && clientId) {
                    await updateDoc(doc(db, 'clientes', clientId), {
                        beneficio_referido_usado: true,
                        referido_por_id: appliedBenefit.referrerId || null,
                        referido_por_nombre: appliedBenefit.referrerName || null,
                        codigo_referido_usado: appliedBenefit.referralCode || appliedBenefit.folio || null,
                        fecha_canje_referido: Timestamp.now(),
                    });
                }

                // Si es un beneficio de referido válido y la compra cumple el consumo mínimo,
                // acreditar Alfa Coins dinámicas al anfitrión y registrar su notificación + animación en la App Móvil
                if (isEligibleReferralReward) {
                    const referrerRef = doc(db, 'clientes', appliedBenefit.referrerId);
                    const referrerSnap = await getDoc(referrerRef);
                    const hostData = referrerSnap.exists() ? referrerSnap.data() : {};
                    const prevHostCoins = Number(
                        hostData?.alfaCoins ??
                        hostData?.alfa_coins ??
                        hostData?.puntos_lealtad ??
                        hostData?.puntosLealtad ??
                        hostData?.puntos ??
                        0
                    );
                    const hostCurrStamps = Number(
                        hostData?.cortes_acumulados ?? hostData?.cortesAcumulados ?? 0
                    );
                    const refRewardId = `reward_ref_${Date.now()}`;
                    loyaltySnapshot.referrer_recompensa_pendiente_id = refRewardId;

                    await updateDoc(referrerRef, {
                        puntos: increment(dynamicRefHostCoins),
                        alfaCoins: increment(dynamicRefHostCoins),
                        alfa_coins: increment(dynamicRefHostCoins),
                        puntosLealtad: increment(dynamicRefHostCoins),
                        puntos_lealtad: increment(dynamicRefHostCoins),
                        amigos_referidos: increment(1),
                        recompensa_pendiente: {
                            id: refRewardId,
                            tipo_recompensa: 'referido',
                            ...(invitedFriendName ? { amigo_referido_nombre: invitedFriendName } : {}),
                            sello_agregado: false,
                            sellos_ganados: 0,
                            sellos_anteriores: hostCurrStamps,
                            sellos_actuales: hostCurrStamps,
                            meta_sellos: targetStampsConfig,
                            corte_gratis_desbloqueado: Boolean(hostData?.corte_gratis_disponible),
                            coins_ganadas: dynamicRefHostCoins,
                            coins_anteriores: prevHostCoins,
                            coins_actuales: prevHostCoins + dynamicRefHostCoins,
                            fecha: new Date().toISOString(),
                        },
                    });
                    toast({
                        title: `🪙 ¡${dynamicRefHostCoins} Alfa Coins Acreditados al Anfitrión!`,
                        description: `Se abonaron automáticamente ${dynamicRefHostCoins} Alfa Coins y notificación en App a ${appliedBenefit.referrerName}.`,
                    });
                }
            } catch (e) {
                console.error("Error updating canjes_beneficios in sale finalization:", e);
            }
        }

        // Persistir snapshot exacto de lealtad y beneficios en el documento de la venta para reversión automática 100% fiel si se elimina
        if (db && finalizedSaleId) {
            try {
                await updateDoc(doc(db, 'ventas', finalizedSaleId), {
                    lealtad_aplicada: removeUndefinedFields(loyaltySnapshot),
                });
            } catch (e) {
                console.warn('No se pudo guardar lealtad_aplicada en la venta:', e);
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
                            benefitLabel: (appliedBenefit && !appliedBenefit.isReferralBlocked && !appliedBenefit.isFreeCutBlocked)
                                ? (appliedBenefit.isReferralBenefit
                                    ? `Invita a un Amigo (-${Number(referralConfig.descuento_amigo_pct ?? REFERRAL_DISCOUNT_PERCENT)}%${appliedBenefit.referralCode ? ` | ${appliedBenefit.referralCode}` : ''})`
                                    : (appliedBenefit.benefitTitle || 'Beneficio Pase Alfa'))
                                : undefined,
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

    const isSubmittingRef = useRef(false);
    const isSendingTerminalRef = useRef(false);

    const validateBirthdayCartBeforeCharge = (): { ok: boolean; message?: string } => {
        const isBirthday = Boolean(
            appliedBenefit && (
                appliedBenefit.isBirthdayBenefit ||
                appliedBenefit.benefitId === 'regalo_cumpleanos' ||
                String(appliedBenefit.folio || '').includes('CUMPLE') ||
                String(appliedBenefit.benefitTitle || '').toLowerCase().includes('cumple')
            )
        );
        if (!isBirthday) return { ok: true };
        const tierId = (clientLevelInfo?.tierId || 'member') as 'member' | 'gold' | 'vip';
        const options = resolveClientBirthdayGifts(tierId, cumpleanosConfig);
        const activeOpt =
            options.find((o) => o.id === (selectedBirthdayOptionId || appliedBenefit?.birthdayOptionId)) ||
            options[0] ||
            null;
        if (
            activeOpt &&
            (activeOpt.tipo === 'servicio_gratis' ||
                activeOpt.tipo === 'producto_gratis' ||
                activeOpt.tipo === 'descuento_servicio') &&
            !cart.some((it) => it.birthdayDiscountApplied)
        ) {
            return {
                ok: false,
                message:
                    'El regalo de cumpleaños seleccionado requiere tener el servicio o producto elegible con descuento aplicado en el carrito antes de cobrar (o retira el beneficio con la X).',
            };
        }
        return { ok: true };
    };

    // --- LOGICA DE COBRO CON TERMINAL CORREGIDA ---
    const handleSendToTerminal = async () => {
        if (isSendingTerminalRef.current) return;
        const formData = form.getValues();
        const amountToCharge = paymentMethod === 'combinado' ? (formData.pago_tarjeta || 0) : (total + Number(formData.propina || 0));
        if (!db || !selectedTerminalId || amountToCharge <= 0 || !selectedClient) return;

        if (cart.some(item => !item.barbero_id)) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'Debes asignar un profesional/vendedor a todos los items del carrito para cobrar en terminal.' });
            return;
        }

        const bdayGuard = validateBirthdayCartBeforeCharge();
        if (!bdayGuard.ok) {
            toast({ variant: 'destructive', title: 'Regalo de Cumpleaños Incompleto', description: bdayGuard.message });
            return;
        }

        isSendingTerminalRef.current = true;
        setIsSendingToTerminal(true);
        setIsWaitingForPayment(true);

        // 0. Limpiar cualquier intento previo en estado Pendiente (de esta sesión o de la misma cita)
        if (saleIdRef.current) {
            const prevPendingId = saleIdRef.current;
            saleIdRef.current = null;
            await revertPendingSale(prevPendingId);
        }
        if (reservationId) {
            try {
                const staleQuery = query(
                    collection(db, 'ventas'),
                    where('reservationId', '==', reservationId),
                    where('pago_estado', '==', 'Pendiente')
                );
                const staleSnap = await getDocs(staleQuery);
                for (const staleDoc of staleSnap.docs) {
                    if (!staleDoc.id.startsWith('deposit_')) {
                        await revertPendingSale(staleDoc.id);
                    }
                }
            } catch (staleErr) {
                console.error("Error cleaning up stale pending terminal sales:", staleErr);
            }
        }

        // 1. Crear referencia con ID nuevo para ventas
        const saleDocRef = doc(collection(db, 'ventas'));
        const tempSaleId = saleDocRef.id;
        saleIdRef.current = tempSaleId;
        attemptedTerminalIdsRef.current.add(tempSaleId);

        try {
            // 2. Preparamos los datos de la venta para guardarla como "Pendiente"
            //    Esto es crucial para que el webhook tenga qué actualizar.

            let completedSaleId: string | undefined = undefined;
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

                // Validar saldo real en servidor si se aplicó Saldo Pase Alfa junto con Terminal Point
                if ((effectiveWalletAmountToUse || 0) > 0 && selectedClient?.id) {
                    const liveClientSnap = await transaction.get(doc(db, 'clientes', selectedClient.id));
                    const liveBal = liveClientSnap.exists() ? getClientWalletBalance(liveClientSnap.data()) : 0;
                    if (liveBal + 0.01 < effectiveWalletAmountToUse) {
                        throw new Error(`Saldo Pase Alfa insuficiente en servidor ($${formatMoney(liveBal)} disponibles).`);
                    }
                }

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
                const walletForTerminal = Math.max(0, Number(effectiveWalletAmountToUse || 0));
                const saleDataToSave: any = {
                    ...formData,
                    cliente_id: selectedClient.id,
                    local_id: formData.local_id,
                    metodo_pago: walletForTerminal > 0 ? 'combinado' : paymentMethod, // Respeta combinado o tarjeta
                    items: itemsToSave,
                    subtotal: subtotal,
                    descuento: {
                        valor: totalDiscount,
                        tipo: 'fixed',
                        monto: totalDiscount
                    },
                    descuento_alfacoins: pointsDiscount || 0,
                    alfacoins_canjeados: effectiveAlfaCoinsToUse || 0,
                    pago_monedero: walletForTerminal,
                    monedero_descontado: false,
                    tarifa_corte_aplicada: currentHaircutPrice || 140,
                    total: subtotal - totalDiscount,
                    fecha_hora_venta: serverTimestamp(),
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
                            effTr > 0 ? 'transferencia' : null,
                            walletForTerminal > 0 ? 'monedero' : null,
                        ].filter(Boolean);

                        return {
                            detalle_pago_combinado: {
                                efectivo: effE,
                                tarjeta: effT,
                                transferencia: effTr,
                                pagos_en_linea: 0,
                                ...(walletForTerminal > 0 ? { monedero: walletForTerminal } : {}),
                            },
                            propina_metodo: propMetodo,
                            ...(nonZero.length === 1 ? { metodo_pago: nonZero[0] } : {})
                        };
                    })() : walletForTerminal > 0 ? {
                        propina_metodo: paymentMethod,
                        detalle_pago_combinado: {
                            efectivo: 0,
                            tarjeta: total,
                            transferencia: 0,
                            pagos_en_linea: 0,
                            monedero: walletForTerminal,
                        },
                    } : {
                        propina_metodo: paymentMethod
                    }),
                    propina: formData.propina || 0, // Registrar propina (independiente de la venta)
                    monto_pagado_real: total, // Estrictamente el monto de la venta SIN propina
                    saldo_pendiente: 0,
                    creado_en: Timestamp.now(),
                    anticipoPagado: anticipoPagado || 0,
                    ...(appliedBenefit && !appliedBenefit.isReferralBlocked && !appliedBenefit.isFreeCutBlocked ? {
                        beneficio_aplicado: {
                            id: appliedBenefit.benefitId || appliedBenefit.id || null,
                            titulo: appliedBenefit.benefitTitle || appliedBenefit.title || null,
                            folio: appliedBenefit.folio || null,
                            codigo_referido: appliedBenefit.referralCode || null,
                            referrer_id: appliedBenefit.referrerId || null,
                            referrer_name: appliedBenefit.referrerName || null,
                            descuento_porcentaje: appliedBenefit.isReferralBenefit ? REFERRAL_DISCOUNT_PERCENT : null,
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

                // 4. Escuchar cambios en todos los intentos de esta sesión (por si el cliente paga el primer envío tras un reintento)
                if (unsubscribeRef.current) unsubscribeRef.current();

                let hasFinalizedTerminal = false;
                const activeUnsubs: (() => void)[] = [];
                const stopAllListeners = () => {
                    activeUnsubs.forEach(u => {
                        try { u(); } catch (_) {}
                    });
                    activeUnsubs.length = 0;
                };

                const watchedIds = Array.from(attemptedTerminalIdsRef.current);
                watchedIds.forEach((watchedId) => {
                    const watchedDocRef = doc(db, 'ventas', watchedId);
                    const unsub = onSnapshot(watchedDocRef, async (docSnapshot) => {
                        if (hasFinalizedTerminal || !docSnapshot.exists()) return;
                        const data = docSnapshot.data();
                        if (data && (data.pago_estado === 'Pagado' || data.mercado_pago_status === 'approved')) {
                            hasFinalizedTerminal = true;
                            const approvedSaleId = docSnapshot.id;
                            const pendingCurrentId = saleIdRef.current;
                            saleIdRef.current = null;
                            setIsSendingToTerminal(false);
                            setIsWaitingForPayment(false);

                            stopAllListeners();
                            unsubscribeRef.current = undefined;

                            // Si el intento aprobado por la terminal fue uno previo y había otro pendiente activo, revertir el pendiente sobrante
                            if (pendingCurrentId && pendingCurrentId !== approvedSaleId) {
                                try {
                                    await revertPendingSale(pendingCurrentId);
                                } catch (_) {}
                            }

                            // Garantizar que monto_pagado_real nunca incluya la propina y que pago_estado quede en Pagado
                            const safeUpdates: Record<string, any> = {};
                            if (data.pago_estado !== 'Pagado') {
                                safeUpdates.pago_estado = 'Pagado';
                                safeUpdates.saldo_pendiente = 0;
                            }
                            if (data.monto_pagado_real !== undefined && Number(data.propina) > 0 && data.monto_pagado_real > total) {
                                safeUpdates.monto_pagado_real = total;
                            }
                            if (Number(data.propina) > 0 && (!Array.isArray(data.propina_detalles) || data.propina_detalles.length === 0)) {
                                const allBarberos = Array.from(new Set(cart.map(i => i.barbero_id).filter(Boolean)));
                                const uniqueBarberos = allBarberos.filter(id => professionals?.some(p => p.id === id));
                                const targetBarberos = uniqueBarberos.length > 0 ? uniqueBarberos : allBarberos;
                                if (targetBarberos.length > 0) {
                                    const propinaSplit = parseFloat((Number(data.propina) / targetBarberos.length).toFixed(2));
                                    safeUpdates.propina_detalles = targetBarberos.map(bId => ({
                                        barbero_id: bId,
                                        monto: propinaSplit
                                    }));
                                }
                            }
                            if (Object.keys(safeUpdates).length > 0) {
                                try {
                                    await updateDoc(watchedDocRef, safeUpdates);
                                } catch (propErr) {
                                    console.error("Error updating terminal sale fields on snapshot:", propErr);
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
                                        saldo_pendiente: 0,
                                        whatsappConfirmationSent: true,
                                        whatsappReminderSent: true,
                                        whatsappReminderNotNeeded: true,
                                        motivo_cancelacion: deleteField(),
                                        cancelada_automaticamente: deleteField(),
                                        cancelado_en: deleteField(),
                                        items: reservationItems,
                                        precio: subtotal - totalDiscount,
                                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                                    });
                                } catch (resErr) {
                                    console.error("Error updating reservation status on snapshot:", resErr);
                                }
                            }

                            await finalizeSaleProcess(data.cliente_id, data.local_id, approvedSaleId);
                        }
                    });
                    activeUnsubs.push(unsub);
                });

                unsubscribeRef.current = stopAllListeners;

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

            isSendingTerminalRef.current = false;
            setIsSendingToTerminal(false);
            setIsWaitingForPayment(false);
            saleIdRef.current = null;
        } finally {
            isSendingTerminalRef.current = false;
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

        const bdayNextGuard = validateBirthdayCartBeforeCharge();
        if (!bdayNextGuard.ok) {
            toast({
                variant: 'destructive',
                title: 'Regalo de Cumpleaños Incompleto',
                description: bdayNextGuard.message,
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
        setUseWallet(false);
        setWalletCustomAmount(null);
        setSelectedClientId(''); // Reset redeem points state
        setAnticipoPagado(0); // Reset anticipo to prevent cross-contamination between sales
        setReservationId(undefined); // Reset reservationId to prevent modifying wrong reservation
        setAppliedBenefit(null);
        setSelectedBirthdayOptionId('');
        setVipMonthlyCourtesyApplied(false);
        setVipMonthlyUsedThisMonth(false);
        appliedBirthdaySyncRef.current = '';

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
        attemptedTerminalIdsRef.current.clear();
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
            let completedSaleId: string | undefined = undefined;
            await runTransaction(db, async (transaction) => {
                const saleRef = doc(db, 'ventas', saleId);
                const saleDoc = await transaction.get(saleRef);
                if (!saleDoc.exists()) return;

                const saleData = saleDoc.data();
                if (saleData.pago_estado !== 'Pendiente') return;

                // Restaurar Stock (PRE-READ de todos los productos antes de cualquier escritura)
                const items = saleData.items || [];
                const productQtyMap = new Map<string, number>();
                for (const item of items) {
                    if (item.tipo === 'producto' && item.id) {
                        productQtyMap.set(item.id, (productQtyMap.get(item.id) || 0) + (Number(item.cantidad) || 0));
                    }
                }
                const prodEntries = Array.from(productQtyMap.entries());
                const prodDocs = await Promise.all(
                    prodEntries.map(([pid]) => transaction.get(doc(db, 'productos', pid)))
                );

                for (let idx = 0; idx < prodEntries.length; idx++) {
                    const [pid, qtyToRestore] = prodEntries[idx];
                    const productRef = doc(db, 'productos', pid);
                    const productDoc = prodDocs[idx];
                    if (productDoc.exists()) {
                        const productData = productDoc.data() as Product;
                        const currentStock = productData.stock || 0;
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
        if (!db || isSubmittingRef.current) return;
        const bdaySubmitGuard = validateBirthdayCartBeforeCharge();
        if (!bdaySubmitGuard.ok) {
            toast({
                variant: 'destructive',
                title: 'Regalo de Cumpleaños Incompleto',
                description: bdaySubmitGuard.message,
            });
            return;
        }
        isSubmittingRef.current = true;
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
                    // Strict check: Only grab it if it looks like an active partial sale or an unabsorbed deposit sale
                    if (
                        d.pago_estado === 'deposit_paid' ||
                        d.pago_estado === 'Pago Parcial' ||
                        d.pago_estado === 'Pendiente' ||
                        (d.pago_estado === 'Pagado' && d.monto_pagado_real < d.total) ||
                        ((d.tipo_venta === 'anticipo' || doc.id.startsWith('deposit_')) && !d.absorbed_in_sale_id)
                    ) {
                        preFoundSaleId = doc.id;
                        preFoundSaleData = d;
                    }
                }
            }

            let completedSaleId: string | undefined = undefined;
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

                // 2B. READ: Validar Saldo Pase Alfa en vivo antes de cualquier escritura si aplica
                const walletUsedNow = Math.max(0, Number(effectiveWalletAmountToUse || 0));
                let walletClientRef: DocumentReference | null = null;
                let walletLivePrevBalance = 0;
                let walletClientFullName = '';
                if (walletUsedNow > 0 && data.cliente_id) {
                    walletClientRef = doc(db, 'clientes', data.cliente_id);
                    const walletClientSnap = await transaction.get(walletClientRef);
                    if (!walletClientSnap.exists()) {
                        throw new Error('No se encontró el perfil del cliente para descontar Saldo Pase Alfa.');
                    }
                    const wcData = walletClientSnap.data() || {};
                    walletLivePrevBalance = getClientWalletBalance(wcData);
                    walletClientFullName = `${wcData.nombre || ''} ${wcData.apellido || ''}`.trim();
                    if (walletLivePrevBalance + 0.01 < walletUsedNow) {
                        throw new Error(
                            `Saldo Pase Alfa insuficiente en servidor ($${formatMoney(walletLivePrevBalance)} MXN disponibles vs $${formatMoney(walletUsedNow)} MXN solicitados).`
                        );
                    }
                }

                // --- WRITES START HERE ---
                // 3. WRITES: Ejecutar descuento atómico de Saldo Pase Alfa y actualizaciones de stock pendientes
                if (walletUsedNow > 0 && walletClientRef) {
                    const nextWalletBal = Math.max(0, Math.round((walletLivePrevBalance - walletUsedNow) * 100) / 100);
                    transaction.update(walletClientRef, {
                        saldo_monedero: nextWalletBal,
                        saldoMonedero: nextWalletBal,
                        saldo_pase_alfa: nextWalletBal,
                    });
                    const movSpendRef = doc(db, 'movimientos_monedero', `mov_spend_${saleDocRef.id}`);
                    transaction.set(movSpendRef, {
                        id: `mov_spend_${saleDocRef.id}`,
                        cliente_id: data.cliente_id,
                        cliente_nombre: walletClientFullName || 'Cliente',
                        tipo: 'consumo_venta',
                        es_abono: false,
                        monto: walletUsedNow,
                        saldo_anterior: walletLivePrevBalance,
                        saldo_nuevo: nextWalletBal,
                        metodo_pago: amountBeingPaidPreview(total) > 0 ? 'combinado' : 'monedero',
                        referencia_id: saleDocRef.id,
                        local_id: data.local_id,
                        concepto: 'Pago de servicios/productos con Saldo Pase Alfa',
                        creado_por_id: user?.uid || 'staff',
                        creado_por_nombre: user?.displayName || user?.email || 'Recepción',
                        fecha: Timestamp.now(),
                    });
                }

                function amountBeingPaidPreview(val: number) {
                    return Math.max(0, Number(val || 0));
                }

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
                    metodo_pago: (total === 0 && walletUsedNow > 0 && propinaToSave === 0)
                        ? 'monedero'
                        : (total === 0 && pointsDiscount > 0 && propinaToSave === 0)
                            ? 'alfacoins'
                            : (amountBeingPaid === 0 && propinaToSave === 0 && (anticipoPagado > 0 || depositSaleData)
                                ? (depositSaleData?.metodo_pago || 'anticipo')
                                : (walletUsedNow > 0 && amountBeingPaid > 0
                                    ? 'combinado'
                                    : (data.metodo_pago || (anticipoPagado > 0 ? 'anticipo' : 'efectivo')))),
                    items: itemsToSave,
                    subtotal: subtotal,
                    descuento: {
                        valor: totalDiscount,
                        tipo: 'fixed',
                        monto: totalDiscount
                    },
                    descuento_alfacoins: pointsDiscount || 0,
                    alfacoins_canjeados: effectiveAlfaCoinsToUse || 0,
                    ...(walletUsedNow > 0 ? { pago_monedero: walletUsedNow, monedero_descontado: true } : {}),
                    tarifa_corte_aplicada: currentHaircutPrice || 140,
                    total: grandTotal, // Save the full value, not just the remainder
                    propina: propinaToSave,
                    ...(propinaDetalles.length > 0 ? { propina_detalles: propinaDetalles } : {}),
                    fecha_hora_venta: serverTimestamp(),
                    fecha_pago: serverTimestamp(),
                    creado_por_id: user?.uid,
                    creado_por_nombre: user?.displayName || user?.email,
                    pago_estado: 'Pagado',
                    creado_en: serverTimestamp(),
                    anticipoPagado: anticipoPagado || (depositSaleData ? Number(depositSaleData.monto_pagado_real || depositSaleData.monto_anticipo || depositSaleData.anticipoPagado || 0) : 0),
                    // monto_pagado_real SIEMPRE representa el ingreso fresco de hoy SIN propina y SIN saldo monedero ya contabilizado al recargar
                    monto_pagado_real: isDepositLiquidation
                        ? amountBeingPaid
                        : Math.min(
                            grandTotal,
                            (((isUpdate && existingSaleData?.pago_estado !== 'Pendiente') ? Number(existingSaleData?.monto_pagado_real || 0) : (anticipoPagado || 0)) + amountBeingPaid)
                        ),
                    saldo_pendiente: 0,
                    status: 'completed',
                    ...(appliedBenefit && !appliedBenefit.isReferralBlocked && !appliedBenefit.isFreeCutBlocked ? {
                        beneficio_aplicado: {
                            id: appliedBenefit.benefitId || appliedBenefit.id || null,
                            titulo: appliedBenefit.benefitTitle || appliedBenefit.title || null,
                            folio: appliedBenefit.folio || null,
                            codigo_referido: appliedBenefit.referralCode || null,
                            referrer_id: appliedBenefit.referrerId || null,
                            referrer_name: appliedBenefit.referrerName || null,
                            descuento_porcentaje: appliedBenefit.isReferralBenefit ? REFERRAL_DISCOUNT_PERCENT : null,
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
                        pagos_en_linea: 0,
                        ...(walletUsedNow > 0 ? { monedero: walletUsedNow } : {}),
                    };

                    const nonZero = [
                        effE > 0 ? 'efectivo' : null,
                        effT > 0 ? 'tarjeta' : null,
                        effTr > 0 ? 'transferencia' : null,
                        walletUsedNow > 0 ? 'monedero' : null,
                    ].filter(Boolean);

                    if (nonZero.length === 1) {
                        saleDataToSave.metodo_pago = nonZero[0];
                    } else if (nonZero.length > 1) {
                        saleDataToSave.metodo_pago = 'combinado';
                    }
                } else {
                    saleDataToSave.propina_metodo = data.metodo_pago || (anticipoPagado > 0 ? 'anticipo' : 'efectivo');
                    if (walletUsedNow > 0) {
                        const paidNow = amountBeingPaid;
                        saleDataToSave.detalle_pago_combinado = {
                            efectivo: data.metodo_pago === 'efectivo' ? paidNow : 0,
                            tarjeta: data.metodo_pago === 'tarjeta' ? paidNow : 0,
                            transferencia: data.metodo_pago === 'transferencia' ? paidNow : 0,
                            pagos_en_linea: (data.metodo_pago === 'mercadopago' || data.metodo_pago === 'pagos_en_linea') ? paidNow : 0,
                            monedero: walletUsedNow,
                        };
                    } else if (isDepositLiquidation) {
                        const paidNow = amountBeingPaid;
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

                    // 2. Extract current payments (amountBeingPaid is the balance being paid NOW, excluding tip)
                    let currEfectivo = 0;
                    let currTarjeta = 0;
                    let currTransferencia = 0;

                    if (data.metodo_pago === 'combinado') {
                        currEfectivo = saleDataToSave.detalle_pago_combinado?.efectivo ?? (data.pago_efectivo || 0);
                        currTarjeta = saleDataToSave.detalle_pago_combinado?.tarjeta ?? (data.pago_tarjeta || 0);
                        currTransferencia = saleDataToSave.detalle_pago_combinado?.transferencia ?? (data.pago_transferencia || 0);
                    } else if (data.metodo_pago === 'efectivo') {
                        currEfectivo = amountBeingPaid;
                    } else if (data.metodo_pago === 'tarjeta') {
                        currTarjeta = amountBeingPaid;
                    } else if (data.metodo_pago === 'transferencia') {
                        currTransferencia = amountBeingPaid;
                    }

                    // 3. Combine
                    let totalEfectivo = prevEfectivo + currEfectivo;
                    let totalTarjeta = prevTarjeta + currTarjeta;
                    let totalTransferencia = prevTransferencia + currTransferencia;
                    let totalOnline = prevOnline;

                    // CANDADO DE SEGURIDAD ANTISOBRECOBRO:
                    // Si la suma de métodos excede el total de la venta (debido a borradores pendientes no liquidados),
                    // se respeta prioritariamente la decisión actual del cajero.
                    const maxAllowed = saleDataToSave.total || 0;
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
                        walletUsedNow > 0 ? 'monedero' : null,
                    ].filter(Boolean);

                    if (nonZeroMethods.length > 1) {
                        saleDataToSave.metodo_pago = 'combinado';
                        saleDataToSave.detalle_pago_combinado = {
                            efectivo: totalEfectivo,
                            tarjeta: totalTarjeta,
                            transferencia: totalTransferencia,
                            pagos_en_linea: totalOnline,
                            ...(walletUsedNow > 0 ? { monedero: walletUsedNow } : {}),
                        };
                    } else if (nonZeroMethods.length === 1) {
                        saleDataToSave.metodo_pago = nonZeroMethods[0];
                        if (walletUsedNow > 0) {
                            saleDataToSave.detalle_pago_combinado = {
                                efectivo: 0,
                                tarjeta: 0,
                                transferencia: 0,
                                pagos_en_linea: 0,
                                monedero: walletUsedNow,
                            };
                        } else {
                            delete saleDataToSave.detalle_pago_combinado;
                        }
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

                completedSaleId = saleDocRef.id;
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
                        monto_pagado_real: grandTotal,
                        saldo_pendiente: 0,
                        cobrado_en: serverTimestamp(),
                        paid_at: serverTimestamp(),
                        whatsappConfirmationSent: true,
                        whatsappReminderSent: true,
                        whatsappReminderNotNeeded: true,
                        motivo_cancelacion: deleteField(),
                        cancelada_automaticamente: deleteField(),
                        cancelado_en: deleteField(),
                        items: reservationItems,
                        precio: subtotal - totalDiscount,
                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                    });
                }
            });

            await finalizeSaleProcess(data.cliente_id, data.local_id, completedSaleId);

        } catch (error: any) {
            console.error('Error al registrar la venta: ', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'No se pudo registrar la venta. Por favor, intenta de nuevo.',
            });
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    const isLocalAdmin = user?.role !== 'Administrador general';

    return (
        <>
            <Sheet open={isOpen} onOpenChange={handleOpenChange} modal={!isMinimized}>
                <SheetContent
                    className={cn(
                        "w-full sm:max-w-[1100px] h-[100dvh] max-h-[100dvh] flex flex-col p-0 gap-0 transition-transform duration-300 ease-in-out border-l-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background overflow-hidden z-[150]",
                        isMinimized && "translate-x-[100%] shadow-none border-none pointer-events-none"
                    )}
                    hideCloseButton
                    hideOverlay={isMinimized}
                    overlayClassName="z-[140]"
                    data-minimized={isMinimized ? "true" : "false"}
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
                            "absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 z-[160] pointer-events-auto",
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
                                    <SheetTitle className="text-sm sm:text-base font-bold text-white tracking-wide">Registrar Nueva Venta</SheetTitle>
                                    <Badge variant="outline" className="text-[10px] py-0 px-2 border-blue-400/40 text-blue-300 bg-blue-500/10 font-bold">
                                        Paso {step} de 2
                                    </Badge>
                                </div>
                                <SheetDescription className="text-xs text-slate-300 hidden sm:block">
                                    {step === 1 ? 'Busca y agrega servicios o productos al carrito.' : 'Completa los detalles para finalizar la venta.'}
                                </SheetDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 relative z-10">
                            <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => document.dispatchEvent(new CustomEvent('open-qr-scanner', { detail: { fromCashbox: true } }))}
                                            className="h-8 w-8 text-[#C5A880] hover:text-[#e4cfb4] hover:bg-white/10 rounded-lg transition-colors inline-flex"
                                            aria-label="Escanear QR de cliente o beneficio"
                                        >
                                            <QrCode className="h-4 w-4 text-[#C5A880]" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="z-[250] text-xs bg-[#151b2e] text-white border-slate-700 shadow-xl">
                                        Escanear QR de cliente o beneficio
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
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
                                    "md:col-span-3 lg:col-span-2 flex flex-col gap-3 min-h-0 flex-1 overflow-hidden",
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
                                                                <p className="text-[11px] text-muted-foreground">{canViewPhone ? (selectedClient.telefono || 'Sin teléfono') : '••••-••••'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {canEditClient && (
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
                                                            )}
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
                                                        <div className="flex items-center gap-2.5">
                                                            <Button
                                                                type="button"
                                                                variant="link"
                                                                size="sm"
                                                                className="h-auto p-0 text-xs text-[#C5A880] hover:text-[#e4cfb4] font-semibold flex items-center gap-1"
                                                                onClick={() => document.dispatchEvent(new CustomEvent('open-qr-scanner', { detail: { fromCashbox: true } }))}
                                                                title="Escanear Pase Alfa para seleccionar cliente automáticamente"
                                                            >
                                                                <QrCode className="h-3.5 w-3.5 text-[#C5A880]" /> Escanear QR
                                                            </Button>
                                                            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-blue-500 hover:text-blue-400" onClick={() => { setIsEditingClient(false); setIsClientModalOpen(true); }}>
                                                                <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                                            </Button>
                                                        </div>
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
                                    "md:col-span-2 lg:col-span-1 flex flex-col min-h-0 flex-1 overflow-hidden",
                                    mobileTab === 'catalogo' && "hidden md:flex"
                                )} style={{ minHeight: 0 }}>
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
                                        onApplyReferralCode={handleApplyManualReferralCode}
                                        onRemoveBenefit={handleRemoveAppliedBenefit}
                                        alfaCoinUnitValue={alfaCoinUnitValue}
                                        clientLevelInfo={clientLevelInfo}
                                        juntosMinorsCount={juntosMinorsCount}
                                        setJuntosMinorsCount={setJuntosMinorsCount}
                                        currentHaircutPrice={currentHaircutPrice}
                                        targetStampsConfig={targetStampsConfig}
                                        activeCoinsMultiplier={activeCoinsMultiplier}
                                        juntosConfig={juntosConfig}
                                        coinsConfig={coinsConfig}
                                        referralConfig={referralConfig}
                                        cumpleanosConfig={cumpleanosConfig}
                                        selectedBirthdayOptionId={selectedBirthdayOptionId}
                                        onSelectBirthdayOption={setSelectedBirthdayOptionId}
                                        vipMonthlyCourtesyApplied={vipMonthlyCourtesyApplied}
                                        vipMonthlyUsedThisMonth={vipMonthlyUsedThisMonth}
                                        onToggleVipMonthlyCourtesy={handleToggleVipMonthlyCourtesy}
                                        walletAmountUsed={effectiveWalletAmountToUse}
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
                                <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 px-3 sm:px-6 py-3 pb-8 flex-1 min-h-0 overflow-y-auto">
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
                                                                    {hasAppDownloaded && clientLevelInfo?.activo && (
                                                                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-bold border-blue-500/40 text-blue-400 bg-blue-500/10 shrink-0 font-sans">
                                                                            <ShieldCheck className="h-2.5 w-2.5 mr-1 text-blue-400" />
                                                                            {clientLevelInfo.tierName} ({clientLevelInfo.cashbackPct}%)
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                                                    <span className="flex items-center gap-1 shrink-0">
                                                                        <Phone className="h-3 w-3 text-slate-400" />
                                                                        {canViewPhone ? (selectedClient.telefono || 'Sin teléfono') : '••••-••••'}
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
                                                                {hasAppDownloaded && clientLevelInfo?.activo && (
                                                                    <div className="mt-2 pt-1.5 border-t border-border/40 space-y-1.5">
                                                                        {Array.isArray(clientLevelInfo.beneficios) && clientLevelInfo.beneficios.length > 0 && (
                                                                            <p className="text-[10px] text-muted-foreground leading-snug">
                                                                                Privilegios {clientLevelInfo.tierName}: {clientLevelInfo.beneficios.slice(0, 3).join(' · ')}
                                                                            </p>
                                                                        )}
                                                                        {clientLevelInfo.tierId === 'vip' && (
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                {vipMonthlyUsedThisMonth ? (
                                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/30">
                                                                                        Cortesía VIP Barba Express ya usada este mes
                                                                                    </span>
                                                                                ) : (
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="sm"
                                                                                        variant={vipMonthlyCourtesyApplied ? 'destructive' : 'secondary'}
                                                                                        className={cn(
                                                                                            "h-6 px-2 text-[10px] font-bold rounded-md",
                                                                                            !vipMonthlyCourtesyApplied && "bg-blue-600 hover:bg-blue-700 text-white"
                                                                                        )}
                                                                                        onClick={handleToggleVipMonthlyCourtesy}
                                                                                    >
                                                                                        {vipMonthlyCourtesyApplied
                                                                                            ? 'Quitar Cortesía VIP (Barba Express)'
                                                                                            : 'Aplicar Cortesía VIP: 1 Barba Express Gratis'}
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {canEditClient && (
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
                                                            )}
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
                                                                    setVipMonthlyCourtesyApplied(false);
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
                                                        <div className="flex items-center gap-2.5">
                                                            <Button
                                                                type="button"
                                                                variant="link"
                                                                size="sm"
                                                                className="h-auto p-0 text-xs text-[#C5A880] hover:text-[#e4cfb4] font-semibold flex items-center gap-1"
                                                                onClick={() => document.dispatchEvent(new CustomEvent('open-qr-scanner', { detail: { fromCashbox: true } }))}
                                                                title="Escanear Pase Alfa para seleccionar cliente automáticamente"
                                                            >
                                                                <QrCode className="h-3.5 w-3.5 text-[#C5A880]" /> Escanear QR
                                                            </Button>
                                                            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-blue-500 hover:text-blue-400" onClick={() => { setIsEditingClient(false); setIsClientModalOpen(true); }}>
                                                                <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                                            </Button>
                                                        </div>
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

                                        {/* Saldo Pase Alfa (Monedero Prepago) - Solo para clientes con App Móvil vinculada */}
                                        {selectedClient && hasAppDownloaded && (
                                            <div className={cn(
                                                "p-3 rounded-xl border transition-all space-y-2",
                                                clientWalletBalance > 0
                                                    ? "border-blue-500/40 bg-blue-500/10 shadow-xs"
                                                    : "border-border/60 bg-muted/20"
                                            )}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Wallet className={cn("h-4 w-4 shrink-0", clientWalletBalance > 0 ? "text-blue-400" : "text-slate-400")} />
                                                        <div className="min-w-0">
                                                            <span className={cn("text-xs font-bold font-sans block truncate", clientWalletBalance > 0 ? "text-foreground" : "text-muted-foreground")}>
                                                                SALDO PASE ALFA: ${formatMoney(clientWalletBalance)} MXN
                                                            </span>
                                                            <p className="text-[10px] text-muted-foreground font-sans">
                                                                {clientWalletBalance > 0
                                                                    ? maxUsableWalletAmount > 0
                                                                        ? `Aplicable a ${saldoPaseAlfaConfig.aplicable_en === 'servicios' ? 'servicios' : 'servicios y productos'} (no cubre propinas)`
                                                                        : saldoPaseAlfaConfig.activo === false
                                                                            ? 'Programa temporalmente pausado'
                                                                            : 'Sin monto aplicable en este ticket'
                                                                    : 'Monedero prepago sin saldo disponible'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-[11px] font-medium text-foreground">
                                                            {useWallet ? 'Usando' : 'Aplicar'}
                                                        </span>
                                                        <Switch
                                                            checked={useWallet}
                                                            onCheckedChange={(val) => {
                                                                setUseWallet(val);
                                                                if (val && walletCustomAmount === null) {
                                                                    setWalletCustomAmount(maxUsableWalletAmount);
                                                                }
                                                            }}
                                                            disabled={maxUsableWalletAmount <= 0}
                                                        />
                                                    </div>
                                                </div>

                                                {useWallet && clientWalletBalance > 0 && (
                                                    <div className="pt-2 border-t border-blue-500/20 space-y-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs text-muted-foreground">Monto de saldo a usar ($ MXN):</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    max={maxUsableWalletAmount}
                                                                    step="0.01"
                                                                    value={walletCustomAmount !== null ? walletCustomAmount : maxUsableWalletAmount}
                                                                    onChange={(e) => {
                                                                        const val = Number(e.target.value);
                                                                        if (isNaN(val) || val <= 0) {
                                                                            setWalletCustomAmount(0);
                                                                        } else {
                                                                            setWalletCustomAmount(Math.round(Math.min(val, maxUsableWalletAmount) * 100) / 100);
                                                                        }
                                                                    }}
                                                                    className="h-8 w-28 text-xs font-semibold text-right bg-background border-border/70 rounded-lg px-2 font-sans"
                                                                />
                                                                {maxUsableWalletAmount > 0 && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setWalletCustomAmount(maxUsableWalletAmount)}
                                                                        className="h-8 px-2.5 text-[11px] font-bold text-blue-400 hover:bg-blue-500/20 rounded-lg font-sans"
                                                                    >
                                                                        Máx (${formatMoney(maxUsableWalletAmount)})
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs font-semibold text-blue-400 font-sans">
                                                            <span>Cubierto con Saldo Pase Alfa:</span>
                                                            <span className="text-sm font-bold">-${formatMoney(effectiveWalletAmountToUse)} MXN</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

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
                                                                ALFA COINS: {clientAlfaCoins} {clientLevelInfo.activo ? `(${clientLevelInfo.tierName} • ${clientLevelInfo.cashbackPct}%)` : `(${clientLevelInfo.cashbackPct}%)`}
                                                            </span>
                                                            <p className="text-[10px] text-muted-foreground font-sans">
                                                                {clientAlfaCoins > 0
                                                                    ? `Equivalente a $${formatMoney(clientCashAvailable)} MXN ($${alfaCoinUnitValue.toFixed(2)} c/u)${
                                                                          maxUsableAlfaCoins <= 0
                                                                              ? coinsConfig.activo === false
                                                                                  ? ' • Canje pausado'
                                                                                  : clientAlfaCoins < Number(coinsConfig.minimo_canje_coins || 0)
                                                                                  ? ` • Mínimo ${coinsConfig.minimo_canje_coins} coins`
                                                                                  : ' • Sin saldo aplicable a este ticket'
                                                                              : ''
                                                                      }`
                                                                    : 'Sin saldo de ALFA COINS para canjear en este cobro'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => document.dispatchEvent(new CustomEvent('open-qr-scanner', { detail: { fromCashbox: true } }))}
                                                            className="h-7 px-2 text-[11px] font-semibold border-[#C5A880]/40 text-[#C5A880] hover:bg-[#C5A880]/20 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                                                            title="Escanear QR de la App de este cliente o beneficio"
                                                        >
                                                            <QrCode className="h-3.5 w-3.5 text-[#C5A880]" />
                                                            <span className="hidden sm:inline">Escanear QR</span>
                                                        </Button>
                                                        <div className="flex items-center gap-1.5">
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
                                                                disabled={maxUsableAlfaCoins <= 0}
                                                            />
                                                        </div>
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

                                        {/* Para clientes sin app o aún no vinculados, opción para escanear QR */}
                                        {selectedClient && !hasAppDownloaded && (
                                            <div className="p-3 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Coins className="h-4 w-4 shrink-0 text-slate-400" />
                                                    <div className="min-w-0">
                                                        <span className="text-xs font-bold font-sans block truncate text-muted-foreground">
                                                            ALFA COINS & BENEFICIOS
                                                        </span>
                                                        <p className="text-[10px] text-muted-foreground font-sans">
                                                            Escanea el Pase Alfa o beneficio del cliente desde su app móvil
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => document.dispatchEvent(new CustomEvent('open-qr-scanner', { detail: { fromCashbox: true } }))}
                                                    className="h-7 px-2.5 text-[11px] font-semibold border-[#C5A880]/40 text-[#C5A880] hover:bg-[#C5A880]/20 hover:text-white rounded-lg flex items-center gap-1.5 shrink-0"
                                                    title="Escanear QR del cliente o beneficio"
                                                >
                                                    <QrCode className="h-3.5 w-3.5 text-[#C5A880]" />
                                                    <span>Escanear QR</span>
                                                </Button>
                                            </div>
                                        )}

                                        {total === 0 && effectiveWalletAmountToUse > 0 && Number(watchedPropina || 0) === 0 ? (
                                            <Card className="border-2 border-blue-500/60 bg-blue-500/10 rounded-xl p-4 shadow-xs space-y-2.5">
                                                <div className="flex items-center gap-3">
                                                    <Wallet className="h-6 w-6 text-blue-400 shrink-0" />
                                                    <div className="space-y-0.5">
                                                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-sans">
                                                            Venta Cubierta 100% con Saldo Pase Alfa
                                                        </h4>
                                                        <p className="text-xs text-foreground/90 font-sans">
                                                            Se descontarán <strong>${formatMoney(effectiveWalletAmountToUse)} MXN</strong> del monedero de {selectedClient?.nombre} (saldo restante: ${formatMoney(Math.max(0, clientWalletBalance - effectiveWalletAmountToUse))} MXN). No ingresa efectivo nuevo a caja hoy.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between gap-2">
                                                    <span className="text-[11px] text-muted-foreground">¿El cliente desea agregar propina aparte?</span>
                                                    <div className="flex items-center gap-1">
                                                        {[20, 30, 50].map((tipAmt) => (
                                                            <Button
                                                                key={tipAmt}
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => form.setValue('propina', tipAmt, { shouldValidate: true })}
                                                                className="h-6 px-2 text-[11px] font-semibold font-sans"
                                                            >
                                                                +${tipAmt}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </Card>
                                        ) : total === 0 && pointsDiscount > 0 && Number(watchedPropina || 0) === 0 ? (
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
                                                                { id: 'tarjeta', label: 'Terminal Point', desc: 'Cobro con terminal', icon: CreditCard },
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
                                                        disabled={isSendingToTerminal || isWaitingForPayment || terminalsLoading || !selectedTerminalId || totalConPropina <= 0 || cart.some(item => !item.barbero_id)}
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

                                                                            // Verificar si algún intento previo de terminal ya fue aprobado por el webhook
                                                                            // para evitar duplicar ventas cuando hubo reintentos
                                                                            let webhookApprovedSaleId: string | null = null;
                                                                            const candidateIds = Array.from(attemptedTerminalIdsRef.current);
                                                                            for (const candId of candidateIds) {
                                                                                const candSnap = await getDoc(doc(db, 'ventas', candId));
                                                                                if (candSnap.exists()) {
                                                                                    const candData = candSnap.data();
                                                                                    if (candData.pago_estado === 'Pagado' || candData.mercado_pago_status === 'approved') {
                                                                                        webhookApprovedSaleId = candId;
                                                                                        break;
                                                                                    }
                                                                                }
                                                                            }

                                                                            if (webhookApprovedSaleId && webhookApprovedSaleId !== confirmedSaleId) {
                                                                                // Un intento previo ya fue cobrado por el webhook; cancelar este borrador duplicado
                                                                                await revertPendingSale(confirmedSaleId);
                                                                            } else if (!webhookApprovedSaleId) {
                                                                                const saleRef = doc(db, 'ventas', confirmedSaleId);
                                                                                const walletManualAmt = Math.max(0, Number(effectiveWalletAmountToUse || 0));
                                                                                if (walletManualAmt > 0 && selectedClient?.id) {
                                                                                    await runTransaction(db, async (tx) => {
                                                                                        const sSnap = await tx.get(saleRef);
                                                                                        const cRef = doc(db, 'clientes', selectedClient.id);
                                                                                        const cSnap = await tx.get(cRef);
                                                                                        let didDeduct = false;
                                                                                        if (sSnap.exists() && !sSnap.data()?.monedero_descontado && cSnap.exists()) {
                                                                                            const cData = cSnap.data() || {};
                                                                                            const prevW = getClientWalletBalance(cData);
                                                                                            const nextW = Math.max(0, Math.round((prevW - walletManualAmt) * 100) / 100);
                                                                                            tx.update(cRef, {
                                                                                                saldo_monedero: nextW,
                                                                                                saldoMonedero: nextW,
                                                                                                saldo_pase_alfa: nextW,
                                                                                            });
                                                                                            const movRef = doc(db, 'movimientos_monedero', `mov_spend_${confirmedSaleId}`);
                                                                                            tx.set(movRef, {
                                                                                                id: `mov_spend_${confirmedSaleId}`,
                                                                                                cliente_id: selectedClient.id,
                                                                                                cliente_nombre: `${selectedClient.nombre} ${selectedClient.apellido || ''}`.trim(),
                                                                                                tipo: 'consumo_venta',
                                                                                                es_abono: false,
                                                                                                monto: walletManualAmt,
                                                                                                saldo_anterior: prevW,
                                                                                                saldo_nuevo: nextW,
                                                                                                metodo_pago: 'combinado',
                                                                                                referencia_id: confirmedSaleId,
                                                                                                local_id: form.getValues('local_id'),
                                                                                                concepto: 'Pago combinado Saldo Pase Alfa + Terminal Point (Confirmación Manual)',
                                                                                                creado_por_id: user?.uid || 'staff',
                                                                                                creado_por_nombre: user?.displayName || user?.email || 'Recepción',
                                                                                                fecha: Timestamp.now(),
                                                                                            });
                                                                                            didDeduct = true;
                                                                                        }
                                                                                        tx.update(saleRef, {
                                                                                            pago_estado: 'Pagado',
                                                                                            metodo_pago: 'combinado',
                                                                                            monto_pagado_real: total,
                                                                                            saldo_pendiente: 0,
                                                                                            propina: form.getValues('propina') || 0,
                                                                                            ...(didDeduct ? { monedero_descontado: true } : {}),
                                                                                            fecha_pago: new Date(),
                                                                                            notas: (form.getValues('notas') || '') + ' [Confirmación Manual de Terminal]',
                                                                                        });
                                                                                    });
                                                                                } else {
                                                                                    // monto_pagado_real SIEMPRE guarda el monto de la venta SIN propina
                                                                                    await updateDoc(saleRef, {
                                                                                        pago_estado: 'Pagado',
                                                                                        metodo_pago: paymentMethod, // Respect initial choice
                                                                                        monto_pagado_real: total,
                                                                                        saldo_pendiente: 0,
                                                                                        propina: form.getValues('propina') || 0,
                                                                                        fecha_pago: new Date(),
                                                                                        notas: (form.getValues('notas') || '') + ' [Confirmación Manual de Terminal]'
                                                                                    });
                                                                                }
                                                                            }
                                                                            attemptedTerminalIdsRef.current.clear();

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
                                                                                        saldo_pendiente: 0,
                                                                                        whatsappConfirmationSent: true,
                                                                                        whatsappReminderSent: true,
                                                                                        whatsappReminderNotNeeded: true,
                                                                                        motivo_cancelacion: deleteField(),
                                                                                        cancelada_automaticamente: deleteField(),
                                                                                        cancelado_en: deleteField(),
                                                                                        items: reservationItems,
                                                                                        precio: subtotal - totalDiscount,
                                                                                        servicio: reservationItems.map((i: any) => i.nombre).join(', ')
                                                                                    });
                                                                                } catch (resErr) {
                                                                                    console.error("Error updating reservation status on snapshot:", resErr);
                                                                                }
                                                                            }
                                                                            await finalizeSaleProcess(form.getValues('cliente_id'), form.getValues('local_id'), confirmedSaleId);

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
                                                                <FormLabel>Terminal Point</FormLabel>
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
                                                                { id: 'tarjeta', label: 'Terminal Point' },
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
                                                                        {selectedClient?.telefono && canViewPhone && (
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
                                        onApplyReferralCode={handleApplyManualReferralCode}
                                        onRemoveBenefit={handleRemoveAppliedBenefit}
                                        alfaCoinUnitValue={alfaCoinUnitValue}
                                        clientLevelInfo={clientLevelInfo}
                                        juntosMinorsCount={juntosMinorsCount}
                                        setJuntosMinorsCount={setJuntosMinorsCount}
                                        currentHaircutPrice={currentHaircutPrice}
                                        targetStampsConfig={targetStampsConfig}
                                        activeCoinsMultiplier={activeCoinsMultiplier}
                                        juntosConfig={juntosConfig}
                                        coinsConfig={coinsConfig}
                                        referralConfig={referralConfig}
                                        cumpleanosConfig={cumpleanosConfig}
                                        selectedBirthdayOptionId={selectedBirthdayOptionId}
                                        onSelectBirthdayOption={setSelectedBirthdayOptionId}
                                        vipMonthlyCourtesyApplied={vipMonthlyCourtesyApplied}
                                        vipMonthlyUsedThisMonth={vipMonthlyUsedThisMonth}
                                        onToggleVipMonthlyCourtesy={handleToggleVipMonthlyCourtesy}
                                        walletAmountUsed={effectiveWalletAmountToUse}
                                    />
                                </div>
                                <SheetFooter className="px-3.5 py-2.5 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background border-t border-border/60 mt-auto shrink-0 flex flex-row items-center justify-between gap-2 sm:gap-3 relative z-10 shadow-[0_-4px_15px_rgba(0,0,0,0.15)]">
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
                                        className="h-10 px-4 sm:px-6 text-xs font-semibold rounded-xl flex-1 sm:flex-initial"
                                        disabled={isSubmitting || isStepTransitioning || (totalConPropina > 0 && isCombinedPaymentInvalid) || (totalConPropina > 0 && !paymentMethod) || (totalConPropina > 0 && paymentMethod === 'tarjeta') || (totalConPropina > 0 && paymentMethod === 'combinado' && (watchedCard || 0) > 0 && selectedTerminalId !== null) || isWaitingForPayment || cart.some(item => item.tipo === 'servicio' && !item.barbero_id) || (totalConPropina > 0 && paymentMethod === 'efectivo' && amountPaid < totalConPropina)}
                                        onClick={(e) => {
                                            if (isStepTransitioning) {
                                                e.preventDefault();
                                                return;
                                            }
                                            if (total === 0 && effectiveWalletAmountToUse > 0 && Number(watchedPropina || 0) === 0) {
                                                form.setValue('metodo_pago', 'monedero', { shouldValidate: true });
                                            } else if (total === 0 && pointsDiscount > 0 && Number(watchedPropina || 0) === 0) {
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

                                            if (cart.some(item => item.tipo === 'servicio' && !item.barbero_id)) {
                                                e.preventDefault();
                                                toast({
                                                    variant: 'destructive',
                                                    title: 'Faltan datos',
                                                    description: 'Asigna un barbero a todos los servicios del carrito para finalizar.'
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
                                        {total === 0 && effectiveWalletAmountToUse > 0 && Number(watchedPropina || 0) === 0
                                            ? `Finalizar con Saldo ($${formatMoney(effectiveWalletAmountToUse)} MXN)`
                                            : total === 0 && pointsDiscount > 0 && Number(watchedPropina || 0) === 0
                                                ? `Finalizar (${effectiveAlfaCoinsToUse} ALFA COINS)`
                                                : (totalConPropina === 0 && anticipoPagado > 0)
                                                    ? `Liquidar Cita ($0.00 MXN)`
                                                    : (paymentMethod === 'combinado' && (watchedCard || 0) > 0 && selectedTerminalId !== null)
                                                        ? `Usa Cobrar en Terminal arriba`
                                                        : `Cobrar $${formatMoney(totalConPropina)} MXN`}
                                    </Button>
                                </SheetFooter>
                            </div>
                        )}
                    </Form>

                    {step === 1 && (
                        <SheetFooter className="px-3.5 py-2.5 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background border-t border-border/60 flex flex-row items-center justify-between gap-2 sm:gap-4 shrink-0 mt-auto relative z-10 shadow-[0_-4px_15px_rgba(0,0,0,0.15)]">
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
                                    className="h-10 px-4 sm:px-5 text-xs font-semibold rounded-xl"
                                    onClick={handleNextStep}
                                    disabled={cart.length === 0 || !selectedClientId || cart.some(item => item.tipo === 'servicio' && !item.barbero_id)}
                                >
                                    Continuar
                                </Button>
                            </div>
                        </SheetFooter>
                    )}
                </SheetContent>
            </Sheet >

            <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
                <DialogContent className="sm:max-w-xl p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card" hideCloseButton>
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 sm:px-6 py-3.5 border-b border-blue-900/40 flex items-center justify-between shrink-0">
                        <div className="header-light-beam" />
                        <div className="flex items-center gap-3 relative z-10">
                            <UserPlus className="h-5 w-5 text-slate-300 shrink-0" />
                            <div>
                                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                                    {isEditingClient && selectedClient ? 'Editar Cliente' : 'Crear Nuevo Cliente'}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300">
                                    {isEditingClient && selectedClient
                                        ? 'Completa la información para actualizar al cliente.'
                                        : 'Completa la información para registrar un nuevo cliente.'}
                                </DialogDescription>
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


