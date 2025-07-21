

'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, Timestamp, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import type { Client, Product, Service as ServiceType } from '@/lib/types';


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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Minus, ShoppingCart, Users, Scissors, CreditCard, Loader2, Trash2 } from 'lucide-react';
import { NewClientForm } from '../clients/new-client-form';


interface Barber { id: string; name: string; }
interface CartItem { id: string; nombre: string; precio: number; cantidad: number; tipo: 'producto' | 'servicio'; }

const saleSchema = z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  barbero_id: z.string().min(1, 'Debes seleccionar un barbero.'),
  metodo_pago: z.string().min(1, 'Debes seleccionar un método de pago.'),
  notas: z.string().optional(),
});

type SaleFormData = z.infer<typeof saleSchema>;

interface NewSaleSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function NewSaleSheet({ isOpen, onOpenChange }: NewSaleSheetProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientQueryKey, setClientQueryKey] = useState(0);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', clientQueryKey);
  const { data: barbers, loading: barbersLoading } = useFirestoreQuery<Barber>('profesionales');
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios');

  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter(s => s && s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, services]);
  
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p && p.nombre && p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, products]);


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

      return [...prev, { id: item.id, nombre: itemName, precio: itemPrice, cantidad: 1, tipo }];
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

  const total = useMemo(() =>
    cart.reduce((acc, item) => acc + (item.precio || 0) * item.cantidad, 0),
    [cart]
  );

  const handleNextStep = () => {
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: 'Carrito vacío', description: 'Debes agregar al menos un ítem para continuar.' });
      return;
    }
    setStep(2);
  };

  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
        notas: '',
    },
  });

  const resetFlow = () => {
    setCart([]);
    setSearchTerm('');
    setStep(1);
    form.reset();
    setIsSubmitting(false);
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    setClientQueryKey(prev => prev + 1); // Refetch clients
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  async function onSubmit(data: SaleFormData) {
     setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ventaRef = doc(collection(db, "ventas"));
        const itemsToSave = cart.map(({ id, nombre, precio, cantidad, tipo }) => ({
            id, nombre, tipo,
            precio_unitario: precio,
            cantidad,
            subtotal: precio * cantidad,
        }));
  
        transaction.set(ventaRef, {
            ...data,
            items: itemsToSave,
            total,
            fecha_hora_venta: Timestamp.now(),
            creado_por: 'admin' // Or use actual user ID
        });
  
        // Update product stock
        for (const item of cart) {
            if (item.tipo === 'producto') {
                const productRef = doc(db, 'productos', item.id);
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) {
                    throw new Error(`Producto con ID ${item.id} no encontrado.`);
                }
                const newStock = productDoc.data().stock - item.cantidad;
                if (newStock < 0) {
                    throw new Error(`Stock insuficiente para ${item.nombre}.`);
                }
                transaction.update(productRef, { stock: newStock });
            }
        }
      });

      toast({
        title: '¡Venta registrada!',
        description: 'La venta se ha guardado correctamente.',
      });
      resetFlow();
      onOpenChange(false);
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
    <div className="col-span-1 bg-card/50 rounded-lg flex flex-col shadow-lg">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center text-lg"><ShoppingCart className="mr-2 h-5 w-5" /> Carrito de Venta</h3>
      </div>
      <ScrollArea className="flex-grow">
        <div className="p-4 space-y-4">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">El carrito está vacío.</p>
          ) : cart.map(item => (
            <div key={item.id} className="flex items-start justify-between p-2 rounded-md hover:bg-muted/50">
              <div>
                <p className="font-medium capitalize">{item.nombre}</p>
                <p className="text-xs text-muted-foreground capitalize">{item.tipo} &middot; ${item.precio?.toLocaleString('es-CL') || '0'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad - 1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-5 text-center font-bold">{item.cantidad}</span>
                  <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQuantity(item.id, item.cantidad + 1)}><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="text-right">
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
        
        {step === 1 && (
            <div className="flex-grow grid grid-cols-3 gap-6 px-6 py-4 overflow-hidden">
                {/* Item Selection */}
                <div className="col-span-2 flex flex-col">
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
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 py-4 overflow-y-auto">
                    {/* Sale Details Form */}
                    <div className="space-y-4">
                        <FormField control={form.control} name="cliente_id" render={({ field }) => (
                            <FormItem>
                                <div className="flex justify-between items-center">
                                    <FormLabel className="flex items-center"><Users className="mr-2 h-4 w-4" /> Cliente</FormLabel>
                                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>+ Nuevo cliente</Button>
                                </div>
                                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder={clientsLoading ? 'Cargando...' : 'Selecciona un cliente'} /></SelectTrigger></FormControl>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="barbero_id" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center"><Scissors className="mr-2 h-4 w-4" /> Barbero</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={barbersLoading}>
                                    <FormControl><SelectTrigger><SelectValue placeholder={barbersLoading ? 'Cargando...' : 'Selecciona un barbero'} /></SelectTrigger></FormControl>
                                    <SelectContent>{barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="metodo_pago" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center"><CreditCard className="mr-2 h-4 w-4" /> Método de Pago</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un método" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="efectivo">Efectivo</SelectItem>
                                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                        <SelectItem value="transferencia">Transferencia</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
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
                    <Button variant="outline" type="button" onClick={() => setStep(1)}>Volver</Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Finalizar Venta
                    </Button>
                </SheetFooter>
            </form>
            </Form>
        )}
        
        {step === 1 && (
            <SheetFooter className="p-6 bg-background border-t">
                 <Button type="button" className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-white" onClick={handleNextStep} disabled={cart.length === 0}>
                    Continuar
                </Button>
            </SheetFooter>
        )}
      </SheetContent>
    </Sheet>

    <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
            <NewClientForm onFormSubmit={handleClientCreated} />
        </DialogContent>
    </Dialog>
    </>
  );
}
