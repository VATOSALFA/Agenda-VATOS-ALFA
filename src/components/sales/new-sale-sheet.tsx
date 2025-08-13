

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
import type { Client, Product, Service as ServiceType, Profesional, Local } from '@/lib/types';
import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';


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
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2, UserPlus, X, AvatarIcon, Mail, Phone, Edit } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useLocal } from '@/contexts/local-context';


interface CartItem { id: string; nombre: string; precio: number; cantidad: number; tipo: 'producto' | 'servicio'; barbero_id?: string; presentation_id?: string;}

const saleSchema = z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  local_id: z.string().min(1, 'Debes seleccionar un local.'),
  metodo_pago: z.string().min(1, 'Debes seleccionar un método de pago.'),
  pago_efectivo: z.coerce.number().optional().default(0),
  pago_tarjeta: z.coerce.number().optional().default(0),
  notas: z.string().optional(),
}).refine(data => {
    if (data.metodo_pago === 'combinado') {
        return (data.pago_efectivo || 0) > 0 && (data.pago_tarjeta || 0) > 0;
    }
    return true;
}, {
    message: 'Debes ingresar montos para ambos métodos de pago.',
    path: ['pago_efectivo'],
});

type SaleFormData = z.infer<typeof saleSchema>;

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

export function NewSaleSheet({ isOpen, onOpenChange, initialData, onSaleComplete }: NewSaleSheetProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [addItemSearchTerm, setAddItemSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientQueryKey, setClientQueryKey] = useState(0);
  const [reservationId, setReservationId] = useState<string | undefined>(undefined);
  const { selectedLocalId } = useLocal();
  
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', clientQueryKey);
  const { data: barbers, loading: barbersLoading } = useFirestoreQuery<Profesional>('profesionales');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios');
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  
  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema),
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

  const total = useMemo(() =>
    cart.reduce((acc, item) => acc + (item.precio || 0) * item.cantidad, 0),
    [cart]
  );
  
  const paymentMethod = form.watch('metodo_pago');
  const cashAmount = form.watch('pago_efectivo');
  const cardAmount = form.watch('pago_tarjeta');

  useEffect(() => {
    if (paymentMethod === 'combinado') {
        const combinedTotal = (cashAmount || 0) + (cardAmount || 0);
        if (combinedTotal > 0 && combinedTotal !== total) {
            form.setError('pago_tarjeta', { type: 'manual', message: `El total combinado debe ser $${total.toLocaleString('es-CL')}`});
        } else {
            form.clearErrors('pago_tarjeta');
        }
    }
  }, [paymentMethod, cashAmount, cardAmount, total, form]);

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
      toast({ variant: 'destructive', title: 'Profesional no asignado', description: 'Por favor, asigna un profesional a cada ítem del carrito.' });
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
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    if(setClientQueryKey) setClientQueryKey(prev => prev + 1); // Refetch clients
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  async function onSubmit(data: SaleFormData) {
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
                staff_id: item.barbero_id,
                comment: `Venta de ${item.cantidad} unidad(es).`
            });
        }
        
        const ventaRef = doc(collection(db, "ventas"));
        const itemsToSave = cart.map(({ id, nombre, precio, cantidad, tipo, barbero_id }) => ({
            id, nombre, tipo, 
            barbero_id: barbero_id || null,
            precio_unitario: precio || 0,
            cantidad,
            subtotal: (precio || 0) * cantidad,
        }));
  
        const saleDataToSave: any = {
            ...data,
            items: itemsToSave,
            total,
            fecha_hora_venta: Timestamp.now(),
            creado_por: 'admin'
        };

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

  const ResumenCarrito = () => (
    <Dialog>
        <div className="col-span-1 bg-card/50 rounded-lg flex flex-col shadow-lg">
        <div className="p-4 border-b flex justify-between items-center">
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
                    <p className="text-xs text-muted-foreground capitalize">{item.tipo} &middot; ${item.precio?.toLocaleString('es-CL') || '0'}</p>
                    <div className="flex items-center gap-2 mt-2">
                    <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-5 text-center font-bold">{item.cantidad}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <div className="mt-2">
                        <Select onValueChange={(value) => updateItemProfessional(item.id, value)} value={item.barbero_id}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Seleccionar profesional" />
                            </SelectTrigger>
                            <SelectContent>
                            {barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="text-right flex-shrink-0">
                    <p className="font-semibold">${((item.precio || 0) * item.cantidad).toLocaleString('es-CL')}</p>
                    <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-destructive/70 hover:text-destructive" onClick={() => removeFromCart(item.id)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                </div>
            ))}
            </div>
        </ScrollArea>
        {cart.length > 0 && (
            <div className="p-4 border-t space-y-4">
            <div className="flex justify-between font-semibold text-xl">
                <span>Total:</span>
                <span className="text-primary">${total.toLocaleString('es-CL')}</span>
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
                        <Input placeholder="Buscar por nombre..." className="pl-10" value={addItemSearchTerm} onChange={e => setAddItemSearchTerm(e.target.value)} />
                    </div>
                     <Tabs defaultValue="servicios" className="flex-grow flex flex-col overflow-hidden">
                        <TabsList>
                            <TabsTrigger value="servicios">Servicios</TabsTrigger>
                            <TabsTrigger value="productos">Productos</TabsTrigger>
                        </TabsList>
                        <ScrollArea className="flex-grow mt-4 pr-4">
                            <TabsContent value="servicios" className="mt-0">
                                <div className="space-y-2">
                                {(servicesLoading ? Array.from({length: 3}) : addItemFilteredServices).map((service, idx) => (
                                     service ? (
                                    <div key={service.id} className="flex items-center justify-between p-2 rounded-md border">
                                        <div>
                                          <p className="font-semibold">{service.name}</p>
                                          <p className="text-sm text-primary">${(service.price || 0).toLocaleString('es-CL')}</p>
                                        </div>
                                        <Button size="sm" onClick={() => addToCart(service, 'servicio')}>Agregar</Button>
                                    </div>
                                     ) : ( <div key={idx} className="h-16 w-full bg-muted animate-pulse rounded-md" /> )
                                ))}
                                </div>
                            </TabsContent>
                            <TabsContent value="productos" className="mt-0">
                                <div className="space-y-2">
                                {(productsLoading ? Array.from({length: 3}) : addItemFilteredProducts).map((product, idx) => (
                                     product ? (
                                     <div key={product.id} className="flex items-center justify-between p-2 rounded-md border">
                                        <div>
                                            <p className="font-semibold">{product.nombre}</p>
                                            <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-CL')}</p>
                                            <p className="text-xs text-muted-foreground">{product.stock} en stock</p>
                                        </div>
                                        <Button size="sm" onClick={() => addToCart(product, 'producto')}>Agregar</Button>
                                    </div>
                                    ) : ( <div key={idx} className="h-16 w-full bg-muted animate-pulse rounded-md" /> )
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

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => {
        if(!open) resetFlow();
        onOpenChange(open);
    }}>
      <SheetContent className="sm:max-w-4xl w-full flex flex-col p-0 shadow-2xl">
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
                        <FormField control={form.control} name="cliente_id" render={({ field }) => (
                            <FormItem className="mb-4">
                                <div className="flex justify-between items-center">
                                <FormLabel>Cliente</FormLabel>
                                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>
                                        <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                </Button>
                                </div>
                                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                    <FormControl><SelectTrigger><SelectValue placeholder={clientsLoading ? 'Cargando...' : 'Busca o selecciona un cliente'} /></SelectTrigger></FormControl>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por nombre..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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
                                                <p className="text-sm text-primary">${(service.price || 0).toLocaleString('es-CL')}</p>
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
                                                <p className="text-sm text-primary">${(product.public_price || 0).toLocaleString('es-CL')}</p>
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
                    <ResumenCarrito />
                </div>
            )}

            {step === 2 && (
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 py-4 overflow-y-auto">
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
                                            <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
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
                                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                        <FormControl><SelectTrigger><SelectValue placeholder={clientsLoading ? 'Cargando...' : 'Busca o selecciona un cliente'} /></SelectTrigger></FormControl>
                                        <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}</SelectContent>
                                    </Select>
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
                                <Select onValueChange={field.onChange} value={field.value}>
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
                    <ResumenCarrito />
                </div>
                 <SheetFooter className="p-6 bg-background border-t mt-auto">
                    <Button variant="outline" type="button" onClick={() => setStep(1)}>Volver y agregar más ítems</Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Finalizar Venta
                    </Button>
                </SheetFooter>
            </form>
            )}
        </Form>
        
        {step === 1 && (
            <SheetFooter className="p-6 bg-background border-t">
                 <Button type="button" className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-white" onClick={handleNextStep} disabled={cart.length === 0 || !selectedClientId}>
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
