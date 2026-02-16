'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, Timestamp, doc, updateDoc, runTransaction, DocumentReference, getDoc, getDocs, deleteDoc, onSnapshot, where, setDoc, query } from 'firebase/firestore'; // <--- AGREGADO setDoc
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';

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
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2, UserPlus, X, Mail, Phone, Edit, Percent, DollarSign, Calculator, Send } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';
import { ClientInput } from '../reservations/client-input';
import type { Service as ServiceType, Product, Client, User, Local, Profesional, Sale, SaleItem, ServiceCategory } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Combobox } from '../ui/combobox';
import { Skeleton } from '../ui/skeleton';


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
}

const saleSchema = (total: number) => z.object({
    cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
    local_id: z.string().min(1, 'Debes seleccionar un local.'),
    metodo_pago: z.string().min(1, 'Debes seleccionar un método de pago.'),
    pago_efectivo: z.coerce.number().optional().default(0),
    pago_tarjeta: z.coerce.number().optional().default(0),
    pago_transferencia: z.coerce.number().optional().default(0),
    propina: z.coerce.number().optional().default(0),
    notas: z.string().optional(),
}).refine(data => {
    if (data.metodo_pago === 'combinado') {
        const combinedTotal = Number(data.pago_efectivo || 0) + Number(data.pago_tarjeta || 0) + Number(data.pago_transferencia || 0);
        return combinedTotal === total;
    }
    return true;
}, {
    message: `La suma debe ser exactamente $${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    path: ['pago_tarjeta'],
});


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

const ResumenCarrito = ({ cart, subtotal, totalDiscount, total, anticipoPagado, onOpenAddItem, updateQuantity, updateItemProfessional, updateItemDiscount, removeFromCart, serviceSellers, productSellers }: any) => (
    <div className="col-span-1 bg-card/50 rounded-lg flex flex-col shadow-lg h-[450px] md:h-full md:min-h-0">
        <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
            <h3 className="font-semibold flex items-center text-lg"><ShoppingCart className="mr-2 h-5 w-5" /> Carrito de Venta</h3>
            <Button variant="outline" size="sm" onClick={onOpenAddItem}><Plus className="mr-2 h-4 w-4" /> Agregar</Button>
        </div>

        <ScrollArea className="flex-grow">
            <div className="p-4 space-y-4">
                {cart.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">El carrito está vacío.</p>
                ) : cart.map((item: CartItem) => (
                    <div key={item.uniqueId} className="flex items-start justify-between p-2 rounded-md hover:bg-muted/50">
                        <div className="flex-grow pr-2">
                            <p className="font-medium capitalize">{item.nombre}</p>
                            <p className="text-xs text-muted-foreground capitalize">{item.tipo} &middot; ${item.precio?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.uniqueId, item.cantidad - 1)}><Minus className="h-3 w-3" /></Button>
                                <span className="w-5 text-center font-bold">{item.cantidad}</span>
                                <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.uniqueId, item.cantidad + 1)}><Plus className="h-3 w-3" /></Button>
                            </div>
                            <div className="mt-2">
                                <Select onValueChange={(value) => updateItemProfessional(item.uniqueId, value)} value={item.barbero_id}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Seleccionar vendedor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(item.tipo === 'servicio'
                                            ? serviceSellers.filter((p: any) => !p.services || p.services.includes(item.id))
                                            : productSellers
                                        ).map((b: { id: string, name: string }) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <DiscountInput item={item} onDiscountChange={updateItemDiscount} />
                                <Select value={item.discountType || 'fixed'} onValueChange={(value: 'fixed' | 'percentage') => updateItemDiscount(item.uniqueId, String(item.discountValue || '0'), value)}>
                                    <SelectTrigger className="w-[60px] h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fixed">$</SelectItem>
                                        <SelectItem value="percentage">%</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <p className="font-semibold">${((item.precio || 0) * item.cantidad).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-destructive/70 hover:text-destructive" onClick={() => removeFromCart(item.uniqueId)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
        {cart.length > 0 && (
            <div className="p-4 border-t space-y-2 text-sm flex-shrink-0">
                <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-destructive">
                    <span>Descuento:</span>
                    <span>-${totalDiscount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {/* This is passed as a prop, but ResumenCarrito doesn't have access to the state 'anticipoPagado' directly unless passed. 
                    I need to add 'anticipoPagado' to the props of ResumenCarrito. 
                    Wait, I am editing ResumenCarrito which is defined in the same file. */}
                {/* I will add a placeholder prop access here, and update the component signature next.*/}
                {anticipoPagado > 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                        <span>Anticipo Pagado:</span>
                        <span>-${anticipoPagado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                )}
                <div className="flex justify-between font-bold text-xl pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-primary">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
        const sorted = [...services].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

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
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Agregar al carrito</DialogTitle>
                    <div className="relative my-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar servicio o producto..." className="pl-10" value={addItemSearchTerm} onChange={e => setAddItemSearchTerm(e.target.value)} />
                    </div>
                </DialogHeader>
                <Tabs defaultValue="servicios" className="h-[50vh] flex flex-col">
                    <TabsList>
                        <TabsTrigger value="servicios">Servicios</TabsTrigger>
                        <TabsTrigger value="productos">Productos</TabsTrigger>
                    </TabsList>
                    <ScrollArea className="flex-grow mt-4">
                        <TabsContent value="servicios" className="space-y-6">
                            {servicesLoading ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {Array.from({ length: 3 }).map((_, idx) => <Card key={idx}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
                                </div>
                            ) : (
                                <>
                                    {/* Regular Services Section */}
                                    <div>
                                        {regularServices.length > 0 && <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Servicios Individuales</h3>}
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {regularServices.map((service: ServiceType) => (
                                                <DialogClose asChild key={service.id}>
                                                    <Card className="cursor-pointer hover:border-primary transition-all shadow-sm hover:shadow-md" onClick={() => addToCart(service, 'servicio')}>
                                                        <CardContent className="p-3">
                                                            <p className="font-semibold text-sm leading-tight mb-1">{service.name}</p>
                                                            <p className="text-xs text-primary font-medium">${(service.price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                        </CardContent>
                                                    </Card>
                                                </DialogClose>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Packages Section */}
                                    {packageServices.length > 0 && (
                                        <div className="pt-2">
                                            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Paquetes</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {packageServices.map((service: ServiceType) => (
                                                    <DialogClose asChild key={service.id}>
                                                        <Card className="cursor-pointer hover:border-primary bg-blue-50/30 transition-all shadow-sm hover:shadow-md" onClick={() => addToCart(service, 'servicio')}>
                                                            <CardContent className="p-3">
                                                                <p className="font-semibold text-sm leading-tight mb-1">{service.name}</p>
                                                                <p className="text-xs text-primary font-medium">${(service.price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                            </CardContent>
                                                        </Card>
                                                    </DialogClose>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {regularServices.length === 0 && packageServices.length === 0 && (
                                        <div className="text-center py-8 text-muted-foreground">
                                            No se encontraron servicios.
                                        </div>
                                    )}
                                </>
                            )}

                        </TabsContent>
                        <TabsContent value="productos">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {(productsLoading) ? (
                                    Array.from({ length: 3 }).map((_, idx) => <Card key={idx}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>)
                                ) : (
                                    addItemFilteredProducts.map((product: Product) => (
                                        <DialogClose asChild key={product.id}>
                                            <Card className="cursor-pointer hover:border-primary transition-all" onClick={() => addToCart(product, 'producto')}>
                                                <CardContent className="p-3">
                                                    <p className="font-semibold text-sm">{product.nombre}</p>
                                                    <p className="text-xs text-primary">${(product.public_price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                                                </CardContent>
                                            </Card>
                                        </DialogClose>
                                    ))
                                )}
                            </div>
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

export function NewSaleSheet({ isOpen, onOpenChange, initialData, onSaleComplete }: NewSaleSheetProps) {
    const { toast } = useToast();
    const { user, db } = useAuth();
    const [step, setStep] = useState(1);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
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

    const total = useMemo(() => Math.max(0, subtotal - totalDiscount - anticipoPagado), [subtotal, totalDiscount, anticipoPagado]);

    const form = useForm<SaleFormData>({
        resolver: zodResolver(saleSchema(total)),
        defaultValues: {
            notas: '',
            pago_efectivo: 0,
            pago_tarjeta: 0,
            pago_transferencia: 0,
        },
    });

    const selectedClientId = form.watch('cliente_id');
    const selectedClient = useMemo(() => {
        return clients.find(c => c.id === selectedClientId)
    }, [selectedClientId, clients]);



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
        const sorted = [...services].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

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
    }


    const paymentMethod = form.watch('metodo_pago');

    const watchedCash = form.watch('pago_efectivo');
    const watchedCard = form.watch('pago_tarjeta');
    const watchedTransfer = form.watch('pago_transferencia');

    const isCombinedPaymentInvalid = useMemo(() => {
        if (paymentMethod !== 'combinado') return false;
        const cashAmount = Number(watchedCash || 0);
        const cardAmount = Number(watchedCard || 0);
        const transferAmount = Number(watchedTransfer || 0);
        return cashAmount + cardAmount + transferAmount !== total;
    }, [paymentMethod, total, watchedCash, watchedCard, watchedTransfer]);

    const combinedTotal = useMemo(() => {
        if (paymentMethod !== 'combinado') return 0;
        const cashAmount = Number(watchedCash || 0);
        const cardAmount = Number(watchedCard || 0);
        const transferAmount = Number(watchedTransfer || 0);
        return cashAmount + cardAmount + transferAmount;
    }, [paymentMethod, watchedCash, watchedCard, watchedTransfer]);

    const remainingAmount = total - combinedTotal;


    useEffect(() => {
        if (isOpen && initialData) {
            // Reset payment identifiers and state from previous sessions
            setAmountPaid(0);
            setIsSendingToTerminal(false);
            setIsWaitingForPayment(false);
            saleIdRef.current = null;

            // Reset form fields that should not persist across sales
            form.setValue('metodo_pago', '');
            form.setValue('pago_efectivo', 0);
            form.setValue('pago_tarjeta', 0);
            form.setValue('pago_transferencia', 0);
            form.setValue('propina', 0);
            form.setValue('notas', '');

            form.setValue('cliente_id', initialData.client.id);
            if (initialData.local_id) {
                form.setValue('local_id', initialData.local_id);
            }
            if (initialData.reservationId) {
                setReservationId(initialData.reservationId);
            }
            const initialCartItems: CartItem[] = initialData.items.map(item => {
                const tipo = 'duration' in item ? 'servicio' : 'producto';
                const precio = tipo === 'servicio' ? (item as ServiceType).price : (item as Product).public_price;
                const nombre = tipo === 'servicio' ? (item as ServiceType).name : (item as Product).nombre;
                const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;
                return {
                    uniqueId: crypto.randomUUID(),
                    id: item.id,
                    nombre: nombre,
                    precio: precio || 0,
                    cantidad: 1,
                    tipo: tipo,
                    presentation_id,
                    barbero_id: (item as any).barbero_id || undefined,
                    commissionPaid: (item as any).commissionPaid,
                    // If items come with discounts or other props, they would be handled here in future
                };
            });
            setCart(initialCartItems);
            if (initialData.anticipoPagado) {
                setAnticipoPagado(initialData.anticipoPagado);
            }
            setStep(2);
        }
    }, [initialData, form, isOpen]);

    // ... existing imports ...

    // ... inside NewSaleSheet ...

    const finalizeSaleProcess = async (clientId: string, localId: string) => {
        toast({
            title: '¡Venta registrada!',
            description: 'La venta se ha completado correctamente.',
        });

        try {
            if (db) {
                // 1. Check for Ticket Printer Setting
                const pagosRef = doc(db, 'configuracion', 'pagos');
                const pagosSnap = await getDoc(pagosRef);
                const printerEnabled = pagosSnap.exists() && pagosSnap.data().ticketPrinterEnabled;

                // 2. Trigger Print if Enabled and Manual Payment (Cash/Combined/Transfer)
                // We prioritize printing for Cash, but usually useful for all walk-ins.
                // User requirement: "una vez incluida todas las ventas que se pagan en efectivo debria de imprimir su ticket"
                // So strictly enforcing cash or combined (which has cash).
                const isCashOrCombined = paymentMethod === 'efectivo' || paymentMethod === 'combinado';

                if (printerEnabled && isCashOrCombined) {
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
                            total: total
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
        if (!db || !selectedTerminalId || total <= 0 || !selectedClient) return;

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

                const formData = form.getValues();

                // C. Objeto de Venta
                const saleDataToSave: any = {
                    ...formData,
                    cliente_id: selectedClient.id,
                    local_id: formData.local_id,
                    metodo_pago: 'tarjeta', // Forzamos tarjeta porque es terminal
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
                    creado_en: Timestamp.now(),
                    anticipoPagado: anticipoPagado || 0,
                };

                if (reservationId) {
                    saleDataToSave.reservationId = reservationId;
                }

                // D. Guardar Venta
                transaction.set(saleDocRef, removeUndefinedFields(saleDataToSave));
            });

            // 3. Llamar a la Cloud Function con el ID del documento que ACABAMOS de crear
            const createPayment = httpsCallable(functions, 'createPointPayment');
            const result: any = await createPayment({
                amount: total,
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
                            setIsSendingToTerminal(false);
                            setIsWaitingForPayment(false);

                            unsubscribe();
                            unsubscribeRef.current = undefined;

                            await finalizeSaleProcess(data.cliente_id, data.local_id);
                        }
                    }
                });

                unsubscribeRef.current = unsubscribe;

            } else {
                throw new Error(result.data.message || 'Error al enviar cobro a la terminal.');
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de Terminal', description: error.message });
            setIsSendingToTerminal(false);
            setIsWaitingForPayment(false);
            saleIdRef.current = null;
        }
    }

    const handleNextStep = () => {
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

        setStep(2);
    };

    const resetComponentsState = useCallback(() => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = undefined;
        }
        setCart([]);
        setSearchTerm('');
        setStep(1);

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
            metodo_pago: '',
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

    const cancelPendingSale = useCallback(async () => {
        if (saleIdRef.current && db && isWaitingForPayment) {
            console.log("Cancelling pending sale due to modal close:", saleIdRef.current);
            try {
                const docRef = doc(db, 'ventas', saleIdRef.current);
                // Mark as Cancelled so it doesn't show as a valid sale
                await updateDoc(docRef, {
                    pago_estado: 'Cancelado',
                    notas: 'Operación cancelada por el usuario antes de completar el pago.'
                });
            } catch (e) {
                console.error("Error cancelling pending sale:", e);
            }
        }
    }, [db, isWaitingForPayment]);

    const handleOpenChange = (open: boolean) => {
        if (!open) {
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
        form.setValue('cliente_id', newClientId, { shouldValidate: true });
    }

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

                if (preFoundSaleId) {
                    // PRIORITIZE the sale found via Query
                    const foundRef = doc(db, 'ventas', preFoundSaleId);
                    // Read inside transaction
                    const saleCheck = await transaction.get(foundRef);
                    if (saleCheck.exists()) {
                        saleDocRef = foundRef;
                        const sData = saleCheck.data();
                        isUpdate = true;
                        existingSaleData = sData;
                    }
                } else if (reservationId) {
                    // Fallback: Try direct lookup (best case: ID matches)
                    const possibleSaleRef = doc(db, 'ventas', reservationId);
                    const possibleSaleDoc = await transaction.get(possibleSaleRef);

                    if (possibleSaleDoc.exists()) {
                        const sData = possibleSaleDoc.data();
                        if (sData.pago_estado === 'deposit_paid' || sData.pago_estado === 'Pago Parcial') {
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
                                    if (sData.pago_estado === 'deposit_paid' || sData.pago_estado === 'Pago Parcial') {
                                        saleDocRef = linkedSaleRef;
                                        isUpdate = true;
                                        existingSaleData = sData;
                                    }
                                }
                            }
                        }
                    }
                }

                if (isUpdate) {
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

                const saleDataToSave: any = {
                    ...data,
                    items: itemsToSave,
                    subtotal: subtotal,
                    descuento: {
                        valor: totalDiscount,
                        tipo: 'fixed',
                        monto: totalDiscount
                    },
                    total: grandTotal, // Save the full value, not just the remainder
                    fecha_hora_venta: Timestamp.now(),
                    fecha_pago: Timestamp.now(),
                    creado_por_id: user?.uid,
                    creado_por_nombre: user?.displayName || user?.email,
                    pago_estado: 'Pagado',
                    creado_en: Timestamp.now(),
                    anticipoPagado: anticipoPagado || 0,
                    monto_pagado_real: (isUpdate ? (existingSaleData.monto_pagado_real || 0) : 0) + amountBeingPaid,
                    saldo_pendiente: 0,
                    status: 'completed'
                };

                if (data.metodo_pago === 'combinado') {
                    saleDataToSave.detalle_pago_combinado = {
                        efectivo: data.pago_efectivo,
                        tarjeta: data.pago_tarjeta,
                        transferencia: data.pago_transferencia,
                    };
                }

                if (isUpdate) {
                    // Merge with existing payments if updating

                    // 1. Extract previous payments
                    let prevEfectivo = 0;
                    let prevTarjeta = 0;
                    let prevTransferencia = 0;
                    let prevOnline = 0;

                    const prevCombined = existingSaleData.detalle_pago_combinado;

                    if (existingSaleData.metodo_pago === 'combinado' && prevCombined) {
                        prevEfectivo = prevCombined.efectivo || 0;
                        prevTarjeta = prevCombined.tarjeta || 0;
                        prevTransferencia = prevCombined.transferencia || 0;
                        prevOnline = prevCombined.pagos_en_linea || 0;
                    } else if (existingSaleData.metodo_pago === 'mercadopago') {
                        // The deposit was likely 'mercadopago'
                        prevOnline = existingSaleData.monto_pagado_real || existingSaleData.total || 0;
                    } else if (existingSaleData.metodo_pago === 'efectivo') {
                        prevEfectivo = existingSaleData.total || 0;
                    } else if (existingSaleData.metodo_pago === 'tarjeta') {
                        prevTarjeta = existingSaleData.total || 0;
                    } else if (existingSaleData.metodo_pago === 'transferencia') {
                        prevTransferencia = existingSaleData.total || 0;
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
                        currEfectivo = amountBeingPaid;
                    } else if (data.metodo_pago === 'tarjeta') {
                        currTarjeta = amountBeingPaid;
                    } else if (data.metodo_pago === 'transferencia') {
                        currTransferencia = amountBeingPaid;
                    }

                    // 3. Combine
                    saleDataToSave.detalle_pago_combinado = {
                        efectivo: prevEfectivo + currEfectivo,
                        tarjeta: prevTarjeta + currTarjeta,
                        transferencia: prevTransferencia + currTransferencia,
                        pagos_en_linea: prevOnline
                    };
                    saleDataToSave.metodo_pago = 'combinado'; // Always combined when merging multiple payments

                    transaction.update(saleDocRef, removeUndefinedFields(saleDataToSave));
                } else {
                    if (reservationId) {
                        saleDataToSave.reservationId = reservationId;
                    }
                    transaction.set(saleDocRef, removeUndefinedFields(saleDataToSave));
                }

                if (reservationId) {
                    const reservationRef = doc(db, 'reservas', reservationId);
                    transaction.update(reservationRef, {
                        pago_estado: 'Pagado',
                        estado: 'Asiste',
                        monto_pagado: saleDataToSave.monto_pagado_real,
                        saldo_pendiente: 0
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
            <Sheet open={isOpen} onOpenChange={handleOpenChange}>
                <SheetContent
                    className="w-full sm:max-w-[1100px] flex flex-col p-0 gap-0"
                    hideCloseButton
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <SheetHeader className="p-6 border-b">
                        <SheetTitle>Registrar Nueva Venta</SheetTitle>
                        <SheetDescription>
                            {step === 1 ? 'Busca y agrega servicios o productos al carrito.' : 'Completa los detalles para finalizar la venta.'}
                        </SheetDescription>
                    </SheetHeader>

                    <Form {...form}>
                        {step === 1 && (
                            <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6 px-4 md:px-6 py-4 overflow-y-auto md:overflow-hidden">
                                <div className="col-span-1 md:col-span-2 flex flex-col gap-4 md:min-h-0">
                                    <div className="flex-shrink-0">
                                        {selectedClient ? (
                                            <Card>
                                                <CardContent className="p-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-9 w-9">
                                                                <AvatarFallback>{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="font-semibold text-sm">{selectedClient.nombre} {selectedClient.apellido}</p>
                                                                <p className="text-xs text-muted-foreground">{selectedClient.telefono}</p>
                                                            </div>
                                                        </div>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <FormField control={form.control} name="cliente_id" render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex justify-between items-center">
                                                        <FormLabel>Cliente *</FormLabel>
                                                        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>
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

                                    <div className="relative mb-4 flex-shrink-0">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Buscar servicio o producto..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                    </div>
                                    <Tabs defaultValue="servicios" className="flex-grow flex flex-col min-h-[400px] md:min-h-0">
                                        <TabsList>
                                            <TabsTrigger value="servicios">Servicios</TabsTrigger>
                                            <TabsTrigger value="productos">Productos</TabsTrigger>
                                        </TabsList>
                                        <ScrollArea className="flex-grow mt-4 pr-4">
                                            <TabsContent value="servicios" className="mt-0 space-y-6">
                                                {servicesLoading ? (
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                        {Array.from({ length: 6 }).map((_, idx) => (
                                                            <Card key={idx}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Regular Services Section */}
                                                        <div>
                                                            {regularServices.length > 0 && <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Servicios Individuales</h3>}
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                                {regularServices.map((service: ServiceType) => (
                                                                    <Card key={service.id} className="cursor-pointer hover:border-primary transition-all shadow-sm hover:shadow-md" onClick={() => addToCart(service, 'servicio')}>
                                                                        <CardContent className="p-4">
                                                                            <p className="font-semibold leading-tight mb-1">{service.name}</p>
                                                                            <p className="text-sm text-primary font-medium">${(service.price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                                        </CardContent>
                                                                    </Card>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Packages Section */}
                                                        {packageServices.length > 0 && (
                                                            <div className="pt-2">
                                                                <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Paquetes</h3>
                                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                                    {packageServices.map((service: ServiceType) => (
                                                                        <Card key={service.id} className="cursor-pointer hover:border-primary bg-blue-50/30 transition-all shadow-sm hover:shadow-md" onClick={() => addToCart(service, 'servicio')}>
                                                                            <CardContent className="p-4">
                                                                                <p className="font-semibold leading-tight mb-1">{service.name}</p>
                                                                                <p className="text-sm text-primary font-medium">${(service.price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                                            </CardContent>
                                                                        </Card>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {regularServices.length === 0 && packageServices.length === 0 && (
                                                            <div className="text-center py-12 text-muted-foreground">
                                                                No se encontraron servicios.
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </TabsContent>
                                            <TabsContent value="productos" className="mt-0">
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                    {productsLoading ? (
                                                        Array.from({ length: 6 }).map((_, idx) => (
                                                            <Card key={idx}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
                                                        ))
                                                    ) : (
                                                        filteredProducts.map((product: Product) => (
                                                            <Card key={product.id} className="cursor-pointer hover:border-primary transition-all" onClick={() => addToCart(product, 'producto')}>
                                                                <CardContent className="p-4">
                                                                    <p className="font-semibold">{product.nombre}</p>
                                                                    <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                                    <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                                                                </CardContent>
                                                            </Card>
                                                        ))
                                                    )}
                                                </div>
                                            </TabsContent>
                                        </ScrollArea>
                                    </Tabs>
                                </div>
                                <ResumenCarrito cart={cart} subtotal={subtotal} totalDiscount={totalDiscount} total={total} anticipoPagado={anticipoPagado} onOpenAddItem={() => setIsAddItemDialogOpen(true)} updateQuantity={updateQuantity} updateItemProfessional={updateItemProfessional} updateItemDiscount={updateItemDiscount} removeFromCart={removeFromCart} serviceSellers={serviceSellers} productSellers={productSellers} />
                            </div>
                        )}

                        {step === 2 && (
                            <div className="h-full flex flex-col overflow-hidden">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 py-4 flex-grow overflow-y-auto">
                                    <div className="space-y-4">

                                        {selectedClient ? (
                                            <Card>
                                                <CardContent className="p-4">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <Avatar className="h-10 w-10">
                                                                <AvatarFallback>{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="font-bold">{selectedClient.nombre} {selectedClient.apellido}</p>
                                                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                                                    <Mail className="h-3 w-3" /> {selectedClient.correo || 'Sin correo'}
                                                                    <Phone className="h-3 w-3 ml-2" /> {selectedClient.telefono}
                                                                </p>
                                                            </div>
                                                        </div>

                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <FormField control={form.control} name="cliente_id" render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex justify-between items-center">
                                                        <FormLabel>Cliente</FormLabel>
                                                        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>
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
                                                <FormItem>
                                                    <FormLabel>Local</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Selecciona un local" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {locales.map(l => (
                                                                <SelectItem key={l.id} value={l.id}>
                                                                    {l.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="metodo_pago"
                                            render={({ field }) => (
                                                <FormItem className="space-y-3">
                                                    <FormLabel className="flex items-center"><CreditCard className="mr-2 h-4 w-4" /> Método de Pago</FormLabel>
                                                    <FormControl>
                                                        <RadioGroup
                                                            onValueChange={field.onChange}
                                                            defaultValue={field.value}
                                                            className="flex flex-wrap gap-2"
                                                        >
                                                            <FormItem>
                                                                <FormControl><RadioGroupItem value="efectivo" id="efectivo" className="sr-only" /></FormControl>
                                                                <FormLabel htmlFor="efectivo" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'efectivo' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Efectivo</FormLabel>
                                                            </FormItem>
                                                            <FormItem>
                                                                <FormControl><RadioGroupItem value="tarjeta" id="tarjeta" className="sr-only" /></FormControl>
                                                                <FormLabel htmlFor="tarjeta" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'tarjeta' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Tarjeta</FormLabel>
                                                            </FormItem>
                                                            <FormItem>
                                                                <FormControl><RadioGroupItem value="transferencia" id="transferencia" className="sr-only" /></FormControl>
                                                                <FormLabel htmlFor="transferencia" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'transferencia' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Transferencia</FormLabel>
                                                            </FormItem>
                                                            <FormItem>
                                                                <FormControl><RadioGroupItem value="combinado" id="combinado" className="sr-only" /></FormControl>
                                                                <FormLabel htmlFor="combinado" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3", field.value === 'combinado' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>Pago Combinado</FormLabel>
                                                            </FormItem>
                                                        </RadioGroup>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {paymentMethod === 'transferencia' && (
                                            <Card className="p-4 bg-muted/50 mt-2">
                                                <FormField
                                                    control={form.control}
                                                    name="propina"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="flex items-center space-x-2">
                                                                <span className="font-semibold">Propina (Opcional)</span>
                                                            </FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                                                    <Input
                                                                        type="number"
                                                                        placeholder="0.00"
                                                                        className="pl-7"
                                                                        min="0"
                                                                        step="0.01"
                                                                        {...field}
                                                                    />
                                                                </div>
                                                            </FormControl>
                                                            <FormMessage />
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                Si el cliente transfirió un monto extra como propina, ingrésalo aquí para considerarlo en las comisiones.
                                                            </p>
                                                        </FormItem>
                                                    )}
                                                />
                                            </Card>
                                        )}

                                        {paymentMethod === 'tarjeta' && (
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
                                                        disabled={isSendingToTerminal || isWaitingForPayment || terminalsLoading || !selectedTerminalId || total <= 0}
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
                                                                Cobrar ${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en Terminal
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
                                                                    // Cancel manual
                                                                    setIsWaitingForPayment(false);
                                                                    setIsSendingToTerminal(false);
                                                                    if (unsubscribeRef.current) {
                                                                        unsubscribeRef.current();
                                                                        unsubscribeRef.current = undefined;
                                                                    }
                                                                    if (saleIdRef.current) {
                                                                        await cancelPendingSale();
                                                                    }
                                                                    toast({ title: "Operación cancelada", description: "Puedes intentar cobrar de nuevo." });
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

                                                                    // Manually force PAIDO status
                                                                    if (saleIdRef.current && db) {
                                                                        try {
                                                                            setIsSubmitting(true);
                                                                            const saleRef = doc(db, 'ventas', saleIdRef.current);
                                                                            await updateDoc(saleRef, {
                                                                                pago_estado: 'Pagado',
                                                                                metodo_pago: 'tarjeta', // Ensure method is card
                                                                                monto_pagado_real: total,
                                                                                fecha_pago: new Date(),
                                                                                notas: (form.getValues('notas') || '') + ' [Confirmación Manual de Terminal]'
                                                                            });

                                                                            // Also update Reservation status if linked
                                                                            if (reservationId) {
                                                                                const resRef = doc(db, 'reservas', reservationId);
                                                                                await updateDoc(resRef, { pago_estado: 'Pagado' });
                                                                            }
                                                                            // finalizeSaleProcess usually takes (saleId, items). Passing cart as second arg.
                                                                            await finalizeSaleProcess(form.getValues('cliente_id'), form.getValues('local_id'));

                                                                        } catch (err) {
                                                                            console.error("Error confirming manual payment:", err);
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
                                            <Card className="p-4 bg-muted/50">
                                                <FormLabel className="flex items-center text-sm font-medium mb-2"><Calculator className="mr-2 h-4 w-4" /> Calculadora de Cambio</FormLabel>
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-2 gap-4 items-center">
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Paga con</FormLabel>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                                                <Input type="number" placeholder="0" className="pl-6" value={amountPaid || ''} onChange={(e) => setAmountPaid(Number(e.target.value))} />
                                                            </div>
                                                        </FormItem>
                                                        <div className="text-center">
                                                            <p className="text-xs text-muted-foreground">Cambio</p>
                                                            <p className="font-bold text-lg text-primary">${Math.max(0, amountPaid - total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                        </div>
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
                                                        <span className="text-muted-foreground">Total Ingresado:</span>
                                                        <span className="font-medium">${combinedTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className={cn("flex justify-between font-semibold", remainingAmount === 0 ? "text-primary" : "text-destructive")}>
                                                        <span>Faltante:</span>
                                                        <span>${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                                <FormMessage className="mt-2 text-center text-xs">
                                                    {form.formState.errors.pago_tarjeta?.message}
                                                </FormMessage>
                                            </Card>
                                        )}
                                        <FormField control={form.control} name="notas" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notas (Opcional)</FormLabel>
                                                <FormControl><Textarea placeholder="Añade un comentario sobre la venta..." {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    <ResumenCarrito cart={cart} subtotal={subtotal} totalDiscount={totalDiscount} total={total} anticipoPagado={anticipoPagado} onOpenAddItem={() => setIsAddItemDialogOpen(true)} updateQuantity={updateQuantity} updateItemProfessional={updateItemProfessional} updateItemDiscount={updateItemDiscount} removeFromCart={removeFromCart} serviceSellers={serviceSellers} productSellers={productSellers} />
                                </div>
                                <SheetFooter className="p-6 bg-background border-t mt-auto">
                                    <Button type="button" variant="outline" onClick={() => setStep(1)}>Volver</Button>
                                    <Button type="submit" disabled={isSubmitting || isCombinedPaymentInvalid || paymentMethod === 'tarjeta' || isWaitingForPayment || cart.some(item => !item.barbero_id)} onClick={(e) => {
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
                                    }}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Finalizar Venta por ${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Button>
                                </SheetFooter>
                            </div>
                        )}
                    </Form>

                    <SheetFooter className="p-6 bg-background border-t flex justify-end gap-4">
                        {step === 1 && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleClose}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleNextStep}
                                    disabled={cart.length === 0 || !selectedClientId || cart.some(item => !item.barbero_id)}
                                >
                                    Continuar
                                </Button>
                            </>
                        )}
                    </SheetFooter>
                </SheetContent>
            </Sheet >

            <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
                <DialogContent className="sm:max-w-lg" hideCloseButton>
                    <DialogHeader>
                        <DialogTitle>Crear Nuevo Cliente</DialogTitle>
                        <DialogDescription>
                            Completa la información para registrar un nuevo cliente en el sistema.
                        </DialogDescription>
                    </DialogHeader>
                    <NewClientForm onFormSubmit={handleClientCreated} onCancel={() => setIsClientModalOpen(false)} initialName={clientSearchTerm} />
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


