'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Scissors, User, Plus, Minus, ShoppingBag, Eye, MapPin, ChevronDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomLoader } from '@/components/ui/custom-loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParticlesBackground } from '@/components/ui/particles-background';
import { cn } from '@/lib/utils'; // Make sure this is imported

export default function LandingPage() {
    const { data: services, loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: professionals, loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const { data: products, loading: loadingProducts } = useFirestoreQuery<any>('productos');
    const { data: empresa, loading: loadingEmpresa } = useFirestoreQuery<any>('empresa');
    const { data: locales, loading: loadingLocales } = useFirestoreQuery<any>('locales');
    const { data: settingsData } = useFirestoreQuery<any>('settings');

    const router = useRouter();
    // Cart stored as array of Service IDs to allow multiples
    const [cart, setCart] = useState<string[]>([]);
    const [productCart, setProductCart] = useState<string[]>([]); // New: Product Cart
    const [selectedPro, setSelectedPro] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null); // New: Selected Product
    const [selectedBranch, setSelectedBranch] = useState<string>('');

    // Auto-select branch if only one exists or set default
    useEffect(() => {
        if (locales && locales.length > 0 && !selectedBranch) {
            const activeLocales = locales.filter((l: any) => l.status === 'active');
            if (activeLocales.length > 0) {
                setSelectedBranch(activeLocales[0].id);
            }
        }
    }, [locales, selectedBranch]);

    if (loadingServices || loadingEmpresa || loadingLocales) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <CustomLoader size={50} />
            </div>
        );
    }

    const websiteSettings = settingsData?.find((d: any) => d.id === 'website') || {};

    if (websiteSettings.onlineReservations === false) {
        return (
            <div className="flex flex-col h-screen w-full items-center justify-center bg-background px-4 text-center">
                <div className="max-w-md space-y-6">
                    <div className="flex justify-center mb-6">
                        {/* Optional Logo */}
                        {empresa?.[0]?.logo_url && (
                            <img src={empresa[0].logo_url} alt="Logo" className="h-20 w-auto object-contain" />
                        )}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Reservas no disponibles temporalmente</h1>
                    <p className="text-muted-foreground">
                        En este momento no estamos aceptando reservas en línea. Por favor, contáctanos directamente o intenta más tarde.
                    </p>
                    {empresa?.[0]?.phone && (
                        <Button className="mt-4" onClick={() => window.location.href = `tel:${empresa[0].phone}`}>
                            Llamar al {empresa[0].phone}
                        </Button>
                    )}
                </div>
            </div>
        );
    }
    const companyName = empresa?.[0]?.name || 'Vatos Alfa';
    const companySlogan = websiteSettings.slogan || empresa?.[0]?.slogan || 'Estilo y profesionalismo para el hombre moderno.';
    const companyDescription = empresa?.[0]?.description || '';
    const logoUrl = empresa?.[0]?.logo_url;
    const iconUrl = empresa?.[0]?.icon_url;

    const formatPrice = (price: any) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(price) || 0);
    };

    // --- SERVICE CART ACTIONS ---
    const addToCart = (serviceId: string) => {
        setCart(prev => [...prev, serviceId]);
    };

    const removeFromCart = (serviceId: string) => {
        setCart(prev => {
            const index = prev.indexOf(serviceId);
            if (index === -1) return prev;
            const newCart = [...prev];
            newCart.splice(index, 1);
            return newCart;
        });
    };

    // --- PRODUCT CART ACTIONS ---
    const addToProductCart = (productId: string) => {
        setProductCart(prev => [...prev, productId]);
    };

    const removeFromProductCart = (productId: string) => {
        setProductCart(prev => {
            const index = prev.indexOf(productId);
            if (index === -1) return prev;
            const newCart = [...prev];
            newCart.splice(index, 1);
            return newCart;
        });
    };

    const getCount = (serviceId: string) => cart.filter(id => id === serviceId).length;
    const getProductCount = (productId: string) => productCart.filter(id => id === productId).length;

    // Calculate total
    const totalPrice = cart.reduce((total, id) => {
        const service = services.find((s: any) => s.id === id);
        return total + (service?.price || 0);
    }, 0) + productCart.reduce((total, id) => {
        const product = products?.find((p: any) => p.id === id);
        return total + (product?.public_price || 0);
    }, 0);

    const handleBooking = () => {
        if (cart.length === 0 && productCart.length === 0) return;
        const serviceQuery = cart.join(',');
        const productQuery = productCart.join(',');

        // Pass both services and products to the booking page
        let url = '/reservar?';
        const params = [];
        if (cart.length > 0) params.push(`services=${serviceQuery}`);
        if (productCart.length > 0) params.push(`products=${productQuery}`);
        if (selectedBranch) params.push(`branchId=${selectedBranch}`);

        router.push(url + params.join('&'));
    };

    const totalItems = cart.length + productCart.length;

    // Filter Professionals by Selected Branch
    const filteredProfessionals = professionals?.filter((p: any) => p.active && (!selectedBranch || p.local_id === selectedBranch)) || [];

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground animation-fade-in pb-20">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        {iconUrl ? (
                            <img src={iconUrl} alt="Icon" className="h-9 w-9 rounded-full object-cover border border-slate-200" />
                        ) : logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
                        ) : (
                            <Scissors className="h-6 w-6 text-primary" />
                        )}
                        <span className="hidden sm:inline-block">{companyName}</span>
                    </div>

                    <div className="flex gap-2 items-center">
                        {/* Branch Selector */}
                        {locales && locales.length > 1 && (
                            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Seleccionar Sucursal" />
                                </SelectTrigger>
                                <SelectContent>
                                    {locales.filter((l: any) => l.status === 'active').map((local: any) => (
                                        <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {locales && locales.length === 1 && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mr-2">
                                <MapPin className="h-4 w-4" />
                                {locales[0].name}
                            </div>
                        )}

                        <Link href="#servicios">
                            <Button size="sm">Reservar Cita</Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="flex-1 flex flex-col items-center justify-center py-12 md:py-24 lg:py-32 text-center px-4 relative overflow-hidden bg-card">
                <ParticlesBackground />
                <div className="absolute inset-0 z-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none"></div>
                <h1 className="relative text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-foreground/70 animate-in slide-in-from-bottom-5 duration-700 z-10">
                    {companySlogan}
                </h1>
                <p className="relative text-lg md:text-xl text-muted-foreground max-w-[700px] mb-8 animate-in slide-in-from-bottom-5 duration-1000 delay-200 z-10">
                    Agenda tu cita en segundos. Selecciona sucursal, servicios y profesional.
                </p>
                <div className="relative flex flex-col sm:flex-row gap-4 animate-in fade-in duration-1000 delay-300 z-10">
                    <Link href="#servicios">
                        <Button size="lg" className="h-12 px-8 text-lg w-full sm:w-auto">
                            Ver Servicios <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Company Description & Logo Section */}
            {(companyDescription || logoUrl) && (
                <section className="py-12 bg-white relative overflow-hidden">
                    <div className="container px-4 flex flex-col md:flex-row items-center gap-8 md:gap-16 relative z-10">
                        {logoUrl && (
                            <div className="w-full md:w-1/3 flex justify-center md:justify-end">
                                <div className="relative w-full max-w-[280px] md:max-w-[350px] flex items-center justify-center">
                                    <img src={logoUrl} alt="Company Logo" className="w-full h-auto object-contain max-h-[300px]" />
                                </div>
                            </div>
                        )}
                        <div className={cn("w-full text-center md:text-left", logoUrl ? "md:w-2/3" : "w-full max-w-3xl mx-auto")}>
                            <h2 className="text-3xl font-bold mb-4 tracking-tight text-primary">Sobre Nosotros</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                {companyDescription || "Somos una barbería dedicada a brindar el mejor servicio y estilo para el hombre moderno."}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* Professionals */}
            {filteredProfessionals && filteredProfessionals.length > 0 && (
                <section id="profesionales" className="py-16 md:py-24 container px-4 md:px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestro Equipo</h2>
                        <p className="text-muted-foreground">Expertos a tu disposición en {locales?.find((l: any) => l.id === selectedBranch)?.name || 'nuestra sucursal'}.</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 justify-center">
                        {filteredProfessionals.map((barber: any) => (
                            <Link href={`/reservar?professionalId=${barber.id}`} key={barber.id} className="group">
                                <div className="flex flex-col items-center bg-card p-4 rounded-xl shadow-sm border group-hover:border-primary/50 transition-all duration-300 transform group-hover:-translate-y-1 h-full relative">
                                    <div className="aspect-square w-full rounded-xl bg-muted flex items-center justify-center mb-4 overflow-hidden border-2 border-background shadow-md group-hover:ring-2 group-hover:ring-primary group-hover:shadow-lg transition-all relative">
                                        {barber.avatarUrl ? (
                                            <img src={barber.avatarUrl} alt={barber.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-20 w-20 text-muted-foreground" />
                                        )}

                                        {/* Eye Icon for Profile View */}
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <Button
                                                variant="secondary"
                                                size="icon"
                                                className="h-10 w-10 rounded-full bg-white text-primary hover:bg-white hover:scale-110 transition-transform shadow-lg"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setSelectedPro(barber);
                                                }}
                                            >
                                                <Eye className="h-5 w-5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-lg text-center group-hover:text-primary transition-colors">{barber.name}</h3>
                                    <p className="text-xs md:text-sm text-center text-muted-foreground mt-1 font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">Ver Disponibilidad</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Professional Profile Dialog */}
            <Dialog open={!!selectedPro} onOpenChange={(open) => !open && setSelectedPro(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl overflow-hidden p-0 bg-white rounded-xl sm:rounded-2xl h-[90vh] sm:h-auto max-h-[600px] flex flex-col sm:flex-row">
                    {/* Image Section - Large and Square-ish */}
                    <div className="w-full sm:w-1/2 bg-slate-100 flex items-center justify-center p-6 lg:p-10 relative">
                        <div className="relative w-full aspect-square max-w-[350px] shadow-xl rounded-lg overflow-hidden border-4 border-white transform transition-transform hover:scale-[1.02] duration-500">
                            {selectedPro?.avatarUrl ? (
                                <img src={selectedPro.avatarUrl} alt={selectedPro.name} className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full bg-muted flex items-center justify-center">
                                    <User className="h-24 w-24 text-muted-foreground/50" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className="w-full sm:w-1/2 p-6 lg:p-10 flex flex-col justify-center text-center sm:text-left overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-3xl lg:text-4xl font-extrabold mb-2 text-primary tracking-tight text-center sm:text-left">{selectedPro?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="h-1 w-20 bg-primary/20 mx-auto sm:mx-0 mb-6 rounded-full shrink-0"></div>

                        <div className="prose prose-sm text-muted-foreground leading-relaxed text-lg italic mb-6">
                            "{selectedPro?.biography || "Sin biografía disponible."}"
                        </div>

                        <div className="mt-auto pt-4">
                            <Button className="w-full shadow-lg hover:shadow-xl transition-all h-12 text-lg" onClick={() => {
                                setSelectedPro(null);
                                router.push(`/reservar?professionalId=${selectedPro.id}`);
                            }}>
                                <Scissors className="mr-2 h-5 w-5" /> Reservar Ahora
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Services */}
            <section id="servicios" className="py-16 md:py-24 bg-muted/30">
                <div className="container px-4 md:px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestros Servicios</h2>
                        <p className="text-muted-foreground">Calidad y detalle en cada corte.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {services?.filter((s: any) => s.active).map((service: any) => {
                            const count = getCount(service.id);
                            const isSelected = count > 0;

                            return (
                                <Card key={service.id} className={cn("hover:shadow-xl transition-all duration-300 border-muted group flex flex-col bg-background", isSelected ? "border-primary ring-1 ring-primary" : "")}>
                                    <CardHeader>
                                        <CardTitle className="group-hover:text-primary transition-colors">{service.name}</CardTitle>
                                        <CardDescription className="line-clamp-2">{service.description || 'Servicio profesional de barbería.'}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-1">
                                        <div className="flex justify-between items-baseline mt-2">
                                            <span className="text-2xl font-bold">{formatPrice(service.price)}</span>
                                            <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">{service.duration} min</span>
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        {isSelected ? (
                                            <div className="flex items-center justify-between w-full bg-slate-100 rounded-md p-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => removeFromCart(service.id)}
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <span className="font-bold text-lg">{count}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-10 w-10 text-primary hover:bg-primary/10"
                                                    onClick={() => addToCart(service.id)}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button className="w-full" size="lg" onClick={() => addToCart(service.id)}>
                                                Agendar Cita
                                            </Button>
                                        )}
                                    </CardFooter>
                                </Card>
                            );
                        })}
                        {services?.length === 0 && !loadingServices && (
                            <div className="col-span-full text-center text-muted-foreground p-10 border rounded-lg border-dashed">
                                No hay servicios disponibles en este momento.
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Products Section */}
            {
                products && products.length > 0 && (
                    <section id="productos" className="py-16 md:py-24 container px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tight mb-2">Productos Destacados</h2>
                            <p className="text-muted-foreground">Lleva la experiencia de la barbería a tu casa.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {products.filter((p: any) => p.active && (p.stock > 0 || p.stock === undefined)).map((product: any) => {
                                const pCount = getProductCount(product.id);
                                const isPSelected = pCount > 0;

                                return (
                                    <Card key={product.id} className={cn("overflow-hidden hover:shadow-lg transition-all border-none bg-slate-50/50 relative group", isPSelected && "ring-2 ring-primary bg-primary/5")}>
                                        <div className="aspect-square relative overflow-hidden bg-white mb-4 rounded-xl m-4 border shadow-sm group-hover:shadow-md transition-all">
                                            {product.images && product.images.length > 0 ? (
                                                <img
                                                    src={product.images[0]}
                                                    alt={product.nombre}
                                                    className="h-full w-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center bg-slate-100 text-slate-300">
                                                    <ShoppingBag className="h-16 w-16" />
                                                </div>
                                            )}

                                            {/* Hover Actions: Eye */}
                                            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    className="h-10 w-10 rounded-full bg-white text-primary hover:bg-white hover:scale-110 transition-transform shadow-lg"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setSelectedProduct(product);
                                                    }}
                                                >
                                                    <Eye className="h-5 w-5" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="px-6 pb-6 text-center">
                                            <h3 className="font-bold text-lg mb-1 truncate" title={product.nombre}>{product.nombre}</h3>
                                            <p className="text-primary font-bold text-xl mb-3">{formatPrice(product.public_price)}</p>

                                            {isPSelected ? (
                                                <div className="flex items-center justify-center gap-3 bg-white rounded-full border shadow-sm p-1 max-w-[140px] mx-auto">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-full"
                                                        onClick={() => removeFromProductCart(product.id)}
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </Button>
                                                    <span className="font-bold">{pCount}</span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full"
                                                        onClick={() => addToProductCart(product.id)}
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    className="w-full rounded-full"
                                                    variant="outline"
                                                    onClick={() => addToProductCart(product.id)}
                                                >
                                                    Agregar
                                                </Button>
                                            )}
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    </section>
                )
            }

            {/* Product Details Modal */}
            <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl overflow-hidden p-0 bg-white rounded-xl sm:rounded-2xl h-[90vh] sm:h-auto max-h-[600px] flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/2 bg-slate-50 flex items-center justify-center p-6 lg:p-10 relative">
                        <div className="relative w-full aspect-square max-w-[350px] bg-white shadow-xl rounded-xl overflow-hidden border p-4 flex items-center justify-center">
                            {selectedProduct?.images && selectedProduct.images.length > 0 ? (
                                <img src={selectedProduct.images[0]} alt={selectedProduct.nombre} className="max-h-full max-w-full object-contain" />
                            ) : (
                                <ShoppingBag className="h-24 w-24 text-muted-foreground/30" />
                            )}
                        </div>
                    </div>

                    <div className="w-full sm:w-1/2 p-6 lg:p-10 flex flex-col justify-center text-center sm:text-left overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-2xl lg:text-3xl font-extrabold mb-2 tracking-tight text-center sm:text-left">{selectedProduct?.nombre}</DialogTitle>
                        </DialogHeader>
                        <p className="text-2xl font-bold text-primary mb-6">{selectedProduct ? formatPrice(selectedProduct.public_price) : ''}</p>

                        <div className="prose prose-sm text-muted-foreground leading-relaxed text-base mb-6">
                            {selectedProduct?.description || "Sin descripción disponible."}
                        </div>

                        <div className="mt-auto pt-4">
                            <Button className="w-full shadow-lg hover:shadow-xl transition-all h-12 text-lg" onClick={() => {
                                addToProductCart(selectedProduct.id);
                                setSelectedProduct(null);
                            }}>
                                <ShoppingBag className="mr-2 h-5 w-5" /> Agregar al Pedido
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Cart Sticky Footer */}
            {
                totalItems > 0 && (
                    <div className="fixed bottom-0 left-0 w-full bg-white border-t-2 border-primary/20 p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom-20 duration-500">
                        <div className="container max-w-4xl mx-auto flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-muted-foreground">{totalItems} item{totalItems > 1 ? 's' : ''} seleccionado{totalItems > 1 ? 's' : ''}</span>
                                <span className="text-2xl font-bold text-primary">{formatPrice(totalPrice)}</span>
                            </div>
                            <Button size="lg" className="h-14 px-8 text-lg shadow-lg" onClick={handleBooking}>
                                Confirmar Reserva <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* Locations / Branches Section */}
            {locales && locales.length > 0 && (
                <section className="py-16 bg-slate-50 border-t">
                    <div className="container px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tight mb-2">Visítanos</h2>
                            <p className="text-muted-foreground">Encuentra tu sucursal más cercana.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center">
                            {locales.filter((l: any) => l.status === 'active').map((local: any) => (
                                <Card key={local.id} className="border-none shadow-md hover:shadow-xl transition-all">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <MapPin className="h-5 w-5 text-primary" />
                                            {local.name}
                                        </CardTitle>
                                        <CardDescription>{local.address}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2 text-sm text-muted-foreground">
                                            <p className="flex items-center gap-2"><span className="font-semibold text-foreground">Teléfono:</span> {local.phone}</p>
                                            <p className="flex items-center gap-2"><span className="font-semibold text-foreground">Horario:</span> {local.schedule ? 'Consultar disponibilidad' : 'Lunes a Sábado'}</p>
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        <Button variant="outline" className="w-full" asChild>
                                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local.address)}`} target="_blank" rel="noopener noreferrer">
                                                Ver en Mapa
                                            </a>
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="py-12 border-t bg-card text-center text-sm text-muted-foreground">
                <div className="container px-4 flex flex-col items-center gap-4">
                    <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>

                    {websiteSettings.privacyPolicyEnabled !== false && (
                        <div className="flex flex-wrap justify-center gap-6 text-xs font-medium">
                            <Link href={websiteSettings.privacyUrl || "/privacidad"} className="hover:underline hover:text-primary transition-colors">
                                Aviso de Privacidad
                            </Link>
                            <Link href={websiteSettings.termsUrl || "/terminos"} className="hover:underline hover:text-primary transition-colors">
                                Términos y Condiciones
                            </Link>
                        </div>
                    )}

                    <Link href="/login" className="mt-2 inline-block text-xs hover:underline opacity-50 hover:opacity-100">Acceso Staff</Link>
                </div>
            </footer>
        </div >
    );
}
