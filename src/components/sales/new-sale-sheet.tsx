

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, Timestamp, doc, updateDoc, runTransaction, DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import type { Client, Product, Service as ServiceType, Profesional, Local, User } from '@/lib/types';
import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';
import { MercadoPagoProvider } from './mercado-pago-provider';
import { Payment } from '@mercadopago/sdk-react';


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
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2, UserPlus, X, AvatarIcon, Mail, Phone, Edit, Percent, DollarSign, Calculator, Send } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Combobox } from '../ui/combobox';


interface CartItem { 
    id: string; 
    nombre: string; 
    precio: number; 
    cantidad: number; 
    tipo: 'producto' | 'servicio'; 
    barbero_id?: string; 
    presentation_id?: string;
    discountValue?: string | number;
    discountType?: 'fixed' | 'percentage';
}

const saleSchema = (total: number) => z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  local_id: z.string().min(1, 'Debes seleccionar un local.'),
  metodo_pago: z.string().min(1, 'Debes seleccionar un método de pago.'),
  pago_efectivo: z.coerce.number().optional().default(0),
  pago_tarjeta: z.coerce.number().optional().default(0),
  notas: z.string().optional(),
}).refine(data => {
    if (data.metodo_pago === 'combinado') {
        const combinedTotal = Number(data.pago_efectivo || 0) + Number(data.pago_tarjeta || 0);
        return combinedTotal === total;
    }
    return true;
}, {
    message: `La suma debe ser exactamente $${total.toLocaleString('es-MX')}`,
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
  };
  onSaleComplete?: () => void;
}

const DiscountInput = ({ item, onDiscountChange }: { item: CartItem, onDiscountChange: (itemId: string, value: string, type: 'fixed' | 'percentage') => void }) => {
    const [internalValue, setInternalValue] = useState<string>(String(item.discountValue || ''));

    useEffect(() => {
        setInternalValue(String(item.discountValue || ''));
    }, [item.discountValue]);

    const handleBlur = () => {
        onDiscountChange(item.id, internalValue, item.discountType || 'fixed');
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

const ResumenCarrito = ({ cart, subtotal, totalDiscount, total, step, updateQuantity, updateItemProfessional, updateItemDiscount, removeFromCart, sellers }) => (
    <Dialog>
      <div className="col-span-1 bg-card/50 rounded-lg flex flex-col shadow-lg">
        <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
          <h3 className="font-semibold flex items-center text-lg"><ShoppingCart className="mr-2 h-5 w-5" /> Carrito de Venta</h3>
          {step === 2 && (
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" /> Agregar</Button>
            </DialogTrigger>
          )}
        </div>
        
        <ScrollArea className="flex-grow">
          <div className="p-4 space-y-4">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">El carrito está vacío.</p>
            ) : cart.map(item => (
              <div key={item.id} className="flex items-start justify-between p-2 rounded-md hover:bg-muted/50">
                <div className="flex-grow pr-2">
                  <p className="font-medium capitalize">{item.nombre}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.tipo} &middot; ${item.precio?.toLocaleString('es-MX') || '0'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-5 text-center font-bold">{item.cantidad}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad + 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <div className="mt-2">
                    <Select onValueChange={(value) => updateItemProfessional(item.id, value)} value={item.barbero_id}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar vendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {sellers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                      <DiscountInput item={item} onDiscountChange={updateItemDiscount} />
                      <Select value={item.discountType || 'fixed'} onValueChange={(value: 'fixed' | 'percentage') => updateItemDiscount(item.id, String(item.discountValue || '0'), value)}>
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
                  <p className="font-semibold">${((item.precio || 0) * item.cantidad).toLocaleString('es-MX')}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-destructive/70 hover:text-destructive" onClick={() => removeFromCart(item.id)}>
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
            <span>${subtotal.toLocaleString('es-MX')}</span>
            </div>
            <div className="flex justify-between text-destructive">
            <span>Descuento:</span>
            <span>-${totalDiscount.toLocaleString('es-MX')}</span>
            </div>
            <div className="flex justify-between font-bold text-xl pt-2 border-t">
            <span>Total:</span>
            <span className="text-primary">${total.toLocaleString('es-MX')}</span>
            </div>
        </div>
        )}
      </div>
       <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
          <DialogTitle>Agregar Ítem a la Venta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col h-[60vh]">
          <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar servicio o producto..." className="pl-10" value={addItemSearchTerm} onChange={e => setAddItemSearchTerm(e.target.value)} />
          </div>
          <Tabs defaultValue="servicios" className="flex-grow flex flex-col overflow-hidden">
              <TabsList>
              <TabsTrigger value="servicios">Servicios</TabsTrigger>
              <TabsTrigger value="productos">Productos</TabsTrigger>
              </TabsList>
              <ScrollArea className="flex-grow mt-4 pr-4">
              <TabsContent value="servicios" className="mt-0">
                  <div className="space-y-2">
                  {(servicesLoading ? Array.from({ length: 3 }) : addItemFilteredServices).map((service, idx) => (
                      service ? (
                      <div key={service.id} className="flex items-center justify-between p-2 rounded-md border">
                          <div>
                          <p className="font-semibold">{service.name}</p>
                          <p className="text-sm text-primary">${(service.price || 0).toLocaleString('es-MX')}</p>
                          </div>
                          <Button size="sm" onClick={() => addToCart(service, 'servicio')}>Agregar</Button>
                      </div>
                      ) : (<div key={idx} className="h-16 w-full bg-muted animate-pulse rounded-md" />)
                  ))}
                  </div>
              </TabsContent>
              <TabsContent value="productos" className="mt-0">
                  <div className="space-y-2">
                  {(productsLoading ? Array.from({ length: 3 }) : addItemFilteredProducts).map((product, idx) => (
                      product ? (
                      <div key={product.id} className="flex items-center justify-between p-2 rounded-md border">
                          <div>
                          <p className="font-semibold">{product.nombre}</p>
                          <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-MX')}</p>
                          <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                          </div>
                          <Button size="sm" onClick={() => addToCart(product, 'producto')}>Agregar</Button>
                      </div>
                      ) : (<div key={idx} className="h-16 w-full bg-muted animate-pulse rounded-md" />)
                  ))}
                  </div>
              </TabsContent>
              </ScrollArea>
          </Tabs>
          </div>
          <SheetFooter>
          <DialogClose asChild>
              <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
          </SheetFooter>
      </DialogContent>
    </Dialog>
);


export function NewSaleSheet({ isOpen, onOpenChange, initialData, onSaleComplete }: NewSaleSheetProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [addItemSearchTerm, setAddItemSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientQueryKey, setClientQueryKey] = useState(0);
  const [reservationId, setReservationId] = useState<string | undefined>(undefined);
  const { selectedLocalId } = useLocal();
  
  const [amountPaid, setAmountPaid] = useState<number>(0);


  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', clientQueryKey);
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios');
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  
  const sellers = useMemo(() => {
    const allSellers = new Map<string, { id: string; name: string }>();
    if (professionals) {
      professionals.forEach(p => allSellers.set(p.id, { id: p.id, name: p.name }));
    }
    if (users) {
      users.forEach(u => {
        // Exclude administrators
        if (u.role !== 'Administrador general' && u.role !== 'Administrador local') {
          if (!allSellers.has(u.id)) {
            allSellers.set(u.id, { id: u.id, name: u.name });
          }
        }
      });
    }
    return Array.from(allSellers.values());
  }, [professionals, users]);

  const subtotal = useMemo(() =>
    cart.reduce((acc, item) => acc + (item.precio || 0) * item.cantidad, 0),
    [cart]
  );
  
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

  const total = useMemo(() => Math.max(0, subtotal - totalDiscount), [subtotal, totalDiscount]);
  
  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema(total)),
    defaultValues: {
        notas: '',
        pago_efectivo: 0,
        pago_tarjeta: 0,
    },
  });
  
  const selectedClientId = form.watch('cliente_id');
  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId)
  }, [selectedClientId, clients]);

  useEffect(() => {
    if (selectedLocalId) {
      form.setValue('local_id', selectedLocalId);
    } else if (locales.length > 0) {
      form.setValue('local_id', locales[0].id);
    }
  }, [locales, form, selectedLocalId]);


  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter(s => s && s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, services]);
  
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p && p.nombre && p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, products]);
  
  const addItemFilteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter(s => s && s.name && s.name.toLowerCase().includes(addItemSearchTerm.toLowerCase()));
  }, [addItemSearchTerm, services]);

  const addItemFilteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p && p.nombre && p.nombre.toLowerCase().includes(addItemSearchTerm.toLowerCase()));
  }, [addItemSearchTerm, products]);


  const addToCart = (item: Product | ServiceType, tipo: 'producto' | 'servicio') => {
    setCart(prev => {
      const existingItem = prev.find(ci => ci.id === item.id);
      if (existingItem) {
        return prev.map(ci =>
          ci.id === item.id ? { ...ci, cantidad: ci.cantidad + 1 } : ci
        );
      }
      
      const itemPrice = tipo === 'producto' ? (item as Product).public_price : (item as ServiceType).price;
      const itemName = tipo === 'producto' ? (item as Product).nombre : (item as ServiceType).name;
      const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;

      return [...prev, { id: item.id, nombre: itemName, precio: itemPrice || 0, cantidad: 1, tipo, presentation_id }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(itemId);
      return;
    }
    setCart(prev =>
      prev.map(item => (item.id === itemId ? { ...item, cantidad: newQuantity } : item))
    );
  };
  
  const updateItemProfessional = (itemId: string, barberoId: string) => {
    setCart(prev =>
      prev.map(item => (item.id === itemId ? { ...item, barbero_id: barberoId } : item))
    );
  };

  const updateItemDiscount = (itemId: string, value: string, type: 'fixed' | 'percentage') => {
      setCart(prev => prev.map(item => {
          if (item.id === itemId) {
              return {...item, discountValue: value, discountType: type};
          }
          return item;
      }));
  }

  
  const paymentMethod = form.watch('metodo_pago');
  
  const isCombinedPaymentInvalid = useMemo(() => {
    if (paymentMethod !== 'combinado') return false;
    const cashAmount = Number(form.getValues('pago_efectivo') || 0);
    const cardAmount = Number(form.getValues('pago_tarjeta') || 0);
    return cashAmount + cardAmount !== total;
  }, [form, paymentMethod, total]);

  const combinedTotal = useMemo(() => {
    if (paymentMethod !== 'combinado') return 0;
    const cashAmount = Number(form.getValues('pago_efectivo') || 0);
    const cardAmount = Number(form.getValues('pago_tarjeta') || 0);
    return cashAmount + cardAmount;
  }, [form, paymentMethod]);
  
  const remainingAmount = total - combinedTotal;


  useEffect(() => {
    if (isOpen && initialData) {
        form.setValue('cliente_id', initialData.client.id);
        if(initialData.local_id) {
            form.setValue('local_id', initialData.local_id);
        }
        if(initialData.reservationId) {
            setReservationId(initialData.reservationId);
        }
        const initialCartItems = initialData.items.map(item => {
            const tipo = 'duration' in item ? 'servicio' : 'producto';
            const precio = tipo === 'servicio' ? (item as ServiceType).price : (item as Product).public_price;
            const nombre = tipo === 'servicio' ? (item as ServiceType).name : (item as Product).nombre;
            const presentation_id = tipo === 'producto' ? (item as Product).presentation_id : undefined;
            return {
                id: item.id,
                nombre,
                precio: precio || 0,
                cantidad: 1,
                tipo,
                presentation_id,
                barbero_id: (item as any).barbero_id || undefined,
            };
        });
        setCart(initialCartItems);
        setStep(2);
    }
  }, [initialData, form, isOpen]);

  const handleNextStep = () => {
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: 'Carrito vacío', description: 'Debes agregar al menos un ítem para continuar.' });
      return;
    }
    if (cart.some(item => !item.barbero_id)) {
      toast({ variant: 'destructive', title: 'Vendedor no asignado', description: 'Por favor, asigna un vendedor a cada ítem del carrito.' });
      return;
    }
    setStep(2);
  };

  const resetFlow = () => {
    setCart([]);
    setSearchTerm('');
    setStep(1);
    form.reset();
    setIsSubmitting(false);
    setAmountPaid(0);
    if(initialData) {
        onOpenChange(false);
    }
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    setClientQueryKey(prev => prev + 1); // Refetch clients
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  async function onSubmit(data: SaleFormData, paymentId?: string) {
     setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRefs: { ref: DocumentReference, item: CartItem }[] = [];
        for (const item of cart) {
          if (item.tipo === 'producto') {
            const productRef = doc(db, 'productos', item.id);
            productRefs.push({ ref: productRef, item });
          }
        }
        
        const productDocs = await Promise.all(
          productRefs.map(p => transaction.get(p.ref))
        );

        for(const [index, productDoc] of productDocs.entries()) {
            const { item, ref } = productRefs[index];
            if (!productDoc.exists()) {
              throw new Error(`Producto con ID ${item.id} no encontrado.`);
            }
            const productData = productDoc.data() as Product;
            const currentStock = productData.stock;
            const newStock = currentStock - item.cantidad;
            if (newStock < 0) {
              throw new Error(`Stock insuficiente para ${item.nombre}.`);
            }
            transaction.update(ref, { stock: newStock });
            
            // Check for stock alarm
            if (productData.stock_alarm_threshold && newStock <= productData.stock_alarm_threshold && productData.notification_email) {
                // This will run in the background, no need to await
                sendStockAlert({
                    productName: productData.nombre,
                    currentStock: newStock,
                    recipientEmail: productData.notification_email,
                }).then(() => {
                  toast({
                    variant: "destructive",
                    title: "Alerta de stock bajo",
                    description: `El producto ${productData.nombre} tiene solo ${newStock} unidades.`,
                  });
                }).catch(console.error);
            }

            // Log stock movement
            const movementRef = doc(collection(db, "movimientos_stock"));
            transaction.set(movementRef, {
                date: Timestamp.now(),
                local_id: data.local_id,
                product_id: item.id,
                presentation_id: item.presentation_id || null,
                from: currentStock,
                to: newStock,
                cause: 'Venta',
                staff_id: item.barbero_id || null,
                comment: `Venta de ${item.cantidad} unidad(es).`
            });
        }
        
        const ventaRef = doc(collection(db, "ventas"));
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
                }
            };
        });
  
        const saleDataToSave: any = {
            ...data,
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
        };

        if(paymentId) {
            saleDataToSave.mercado_pago_id = paymentId;
        }
        
        if (data.metodo_pago === 'combinado') {
            saleDataToSave.detalle_pago_combinado = {
                efectivo: data.pago_efectivo,
                tarjeta: data.pago_tarjeta,
            };
        }

        if (reservationId) {
            saleDataToSave.reservationId = reservationId;
        }

        transaction.set(ventaRef, saleDataToSave);

        if (reservationId) {
            const reservationRef = doc(db, 'reservas', reservationId);
            transaction.update(reservationRef, { 
                pago_estado: 'Pagado',
                estado: 'Asiste'
            });
        }
      });

      toast({
        title: '¡Venta registrada!',
        description: 'La venta se ha guardado correctamente.',
      });
      resetFlow();
      onOpenChange(false);
      onSaleComplete?.();
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

  const clientOptions = useMemo(() => {
    return clients.map(client => ({
      value: client.id,
      label: `${client.nombre} ${client.apellido}`,
    }));
  }, [clients]);
  
  const isLocalAdmin = user?.role !== 'Administrador general';

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => {
        if(!open) resetFlow();
        onOpenChange(open);
    }}>
      <SheetContent className="w-full sm:max-w-4xl flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Registrar Nueva Venta</SheetTitle>
          <SheetDescription>
            {step === 1 ? 'Busca y agrega servicios o productos al carrito.' : 'Completa los detalles para finalizar la venta.'}
          </SheetDescription>
        </SheetHeader>
        
        <Form {...form}>
            {step === 1 && (
                <div className="flex-grow grid grid-cols-3 gap-6 px-6 py-4 overflow-hidden">
                    {/* Item Selection */}
                    <div className="col-span-2 flex flex-col">
                        
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
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsClientModalOpen(true)}><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
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
                                     <Combobox
                                        options={clientOptions}
                                        value={field.value}
                                        onChange={field.onChange}
                                        placeholder="Busca o selecciona un cliente..."
                                        loading={clientsLoading}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        )}

                        <div className="relative mt-4 mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar servicio o producto..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <Tabs defaultValue="servicios" className="flex-grow flex flex-col">
                            <TabsList>
                                <TabsTrigger value="servicios">Servicios</TabsTrigger>
                                <TabsTrigger value="productos">Productos</TabsTrigger>
                            </TabsList>
                            <ScrollArea className="flex-grow mt-4 pr-4">
                                <TabsContent value="servicios" className="mt-0">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {(servicesLoading ? Array.from({length: 6}) : filteredServices).map((service, idx) => (
                                        service ? (
                                        <Card key={service.id} className="cursor-pointer hover:border-primary transition-all" onClick={() => addToCart(service, 'servicio')}>
                                            <CardContent className="p-4">
                                                <p className="font-semibold">{service.name}</p>
                                                <p className="text-sm text-primary">${(service.price || 0).toLocaleString('es-MX')}</p>
                                            </CardContent>
                                        </Card>
                                        ) : (
                                            <Card key={idx}><CardContent className="p-4"><div className="h-16 w-full bg-muted animate-pulse rounded-md" /></CardContent></Card>
                                        )
                                    ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="productos" className="mt-0">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {(productsLoading ? Array.from({length: 6}) : filteredProducts).map((product, idx) => (
                                        product ? (
                                        <Card key={product.id} className="cursor-pointer hover:border-primary transition-all" onClick={() => addToCart(product, 'producto')}>
                                            <CardContent className="p-4">
                                                <p className="font-semibold">{product.nombre}</p>
                                                <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-MX')}</p>
                                                <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                                            </CardContent>
                                        </Card>
                                        ) : (
                                            <Card key={idx}><CardContent className="p-4"><div className="h-16 w-full bg-muted animate-pulse rounded-md" /></CardContent></Card>
                                        )
                                    ))}
                                    </div>
                                </TabsContent>
                            </ScrollArea>
                        </Tabs>
                    </div>
                    {/* Cart */}
                    <div className="w-1/3 flex flex-col">
                        <ResumenCarrito cart={cart} subtotal={subtotal} totalDiscount={totalDiscount} total={total} step={step} updateQuantity={updateQuantity} updateItemProfessional={updateItemProfessional} updateItemDiscount={updateItemDiscount} removeFromCart={removeFromCart} sellers={sellers} />
                    </div>
                </div>
            )}

            {step === 2 && (
                <form onSubmit={form.handleSubmit((data) => onSubmit(data))} className="h-full flex flex-col overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 py-4 flex-grow overflow-y-auto">
                        {/* Sale Details Form */}
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
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsClientModalOpen(true)}><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
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
                                         <Combobox
                                            options={clientOptions}
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Busca o selecciona un cliente..."
                                            loading={clientsLoading}
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            )}

                            <FormField
                                control={form.control}
                                name="local_id"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Local</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isLocalAdmin}>
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
                                                <p className="font-bold text-lg text-primary">${Math.max(0, amountPaid - total).toLocaleString('es-MX')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {paymentMethod === 'combinado' && (
                            <Card className="p-4 bg-muted/50">
                                <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="pago_efectivo"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Efectivo</FormLabel>
                                        <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="pago_tarjeta"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tarjeta</FormLabel>
                                        <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                    </FormItem>
                                    )}
                                />
                                </div>
                                <div className="mt-4 space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total Ingresado:</span>
                                        <span className="font-medium">${combinedTotal.toLocaleString('es-MX')}</span>
                                    </div>
                                    <div className={cn("flex justify-between font-semibold", remainingAmount === 0 ? "text-green-600" : "text-destructive")}>
                                        <span>Faltante:</span>
                                        <span>${remainingAmount.toLocaleString('es-MX')}</span>
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
                        {/* Order Summary */}
                        <Dialog>
                            <ResumenCarrito cart={cart} subtotal={subtotal} totalDiscount={totalDiscount} total={total} step={step} updateQuantity={updateQuantity} updateItemProfessional={updateItemProfessional} updateItemDiscount={updateItemDiscount} removeFromCart={removeFromCart} sellers={sellers} />
                        </Dialog>
                    </div>
                    <SheetFooter className="p-6 bg-background border-t mt-auto">
                        <Button type="button" variant="outline" onClick={() => setStep(1)}>Volver</Button>
                        {paymentMethod === 'tarjeta' ? (
                             <MercadoPagoProvider>
                                <Payment
                                    initialization={{
                                        amount: total,
                                        payer: {
                                            email: selectedClient?.correo,
                                            firstName: selectedClient?.nombre,
                                            lastName: selectedClient?.apellido,
                                        },
                                    }}
                                    customization={{
                                        paymentMethods: {
                                            maxInstallments: 1,
                                            creditCard: "all",
                                            debitCard: "all",
                                        },
                                        visual: {
                                            style: {
                                                theme: 'bootstrap',
                                            }
                                        }
                                    }}
                                    onReady={() => console.log('Mercado Pago component is ready.')}
                                    onError={(error: any) => {
                                        console.error('Mercado Pago error:', JSON.stringify(error, null, 2));
                                        toast({
                                            variant: 'destructive',
                                            title: 'Error de Pago',
                                            description: error.message || 'Inténtalo de nuevo.',
                                        });
                                    }}
                                    onSubmit={async ({ formData }) => {
                                        await onSubmit(form.getValues(), formData.payment_id)
                                    }}
                                />
                            </MercadoPagoProvider>
                        ) : (
                             <Button type="submit" disabled={isSubmitting || isCombinedPaymentInvalid}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Finalizar Venta
                            </Button>
                        )}
                    </SheetFooter>
                  </form>
            )}
        </Form>
        
        {step === 1 && (
            <SheetFooter className="p-6 bg-background border-t">
                 <Button
                    type="button"
                    className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-white"
                    onClick={handleNextStep}
                    disabled={cart.length === 0 || !selectedClientId || cart.some(item => !item.barbero_id)}
                >
                    Continuar
                </Button>
            </SheetFooter>
        )}
      </SheetContent>
    </Sheet>

    <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
             <DialogHeader>
                <DialogTitle>Crear Nuevo Cliente</DialogTitle>
                <DialogDescription>
                    Completa la información para registrar un nuevo cliente en el sistema.
                </DialogDescription>
              </DialogHeader>
            <NewClientForm onFormSubmit={handleClientCreated} />
        </DialogContent>
    </Dialog>
    </>
  );
}
