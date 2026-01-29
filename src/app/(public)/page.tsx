'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Scissors, User, Plus, Minus, ShoppingBag, Eye, MapPin, ChevronDown, Clock, Check, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomLoader } from '@/components/ui/custom-loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils'; // Make sure this is imported

// Hook moved inside component

export default function LandingPage() {
    const { data: services, loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: professionals, loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const { data: products, loading: loadingProducts } = useFirestoreQuery<any>('productos');
    const { data: empresa, loading: loadingEmpresa } = useFirestoreQuery<any>('empresa');
    const { data: locales, loading: loadingLocales } = useFirestoreQuery<any>('locales');
    const { data: settingsData, loading: loadingSettings } = useFirestoreQuery<any>('settings');
    const { data: categories } = useFirestoreQuery<any>('categorias_servicios');
    const { data: promotions } = useFirestoreQuery<any>('promociones');

    // Filter active promotions
    const activePromotions = promotions?.filter((p: any) => p.active) || [];

    // Sort and filter services
    const sortedServices = services?.filter((s: any) => s.active).sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999)) || [];

    // Identify Package Categories
    const packageCategoryIds = categories?.filter((c: any) => c.name.toLowerCase().includes('paquete') || c.name.toLowerCase().includes('package')).map((c: any) => c.id) || [];

    const regularServices = sortedServices.filter((s: any) => !packageCategoryIds.includes(s.category));
    const packageServices = sortedServices.filter((s: any) => packageCategoryIds.includes(s.category));

    const router = useRouter();
    // Cart stored as array of Service IDs to allow multiples
    const [cart, setCart] = useState<string[]>([]);
    const [isBooking, setIsBooking] = useState(false);
    const [productCart, setProductCart] = useState<string[]>([]); // New: Product Cart
    const [selectedPro, setSelectedPro] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null); // New: Selected Product
    const [selectedService, setSelectedService] = useState<any>(null); // New: Selected Service
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedPromotion, setSelectedPromotion] = useState<any>(null); // New: Selected Promotion for Terms

    // Auto-select branch if only one exists or set default
    useEffect(() => {
        if (locales && locales.length > 0 && !selectedBranch) {
            const activeLocales = locales.filter((l: any) => l.status === 'active');
            if (activeLocales.length > 0) {
                setSelectedBranch(activeLocales[0].id);
            }
        }
    }, [locales, selectedBranch]);

    if (loadingServices || loadingEmpresa || loadingLocales || loadingSettings) {
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
    const heroDescription = websiteSettings.heroDescription || 'Agenda tu cita en segundos. Selecciona sucursal, servicios y profesional.';
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
        setIsBooking(true);
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
    const filteredProfessionals = professionals?.filter((p: any) => p.active && !p.deleted && (!selectedBranch || p.local_id === selectedBranch)) || [];

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

                        <Link href="/reservar">
                            <Button size="sm">Reservar Cita</Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section
                className="flex-1 flex flex-col items-center justify-center py-12 md:py-24 lg:py-32 text-center px-4 relative overflow-hidden"
                style={{ backgroundColor: websiteSettings?.customization?.primaryColor || 'hsl(var(--primary))' }}
            >
                <div className="absolute inset-0 z-0 bg-background/0 pointer-events-none"></div>
                <h1 className="relative text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter mb-6 text-white animate-in slide-in-from-bottom-5 duration-700 z-10">
                    {companySlogan}
                </h1>
                <p className="relative text-lg md:text-xl text-white/90 max-w-[700px] mb-8 animate-in slide-in-from-bottom-5 duration-1000 delay-200 z-10">
                    {heroDescription}
                </p>
                {/* Navigation Buttons moved to Floating Bar */}
            </section >

            {/* Professional Profile Dialog */}
            <Dialog open={!!selectedPro} onOpenChange={(open) => !open && setSelectedPro(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl overflow-hidden p-0 bg-white rounded-xl sm:rounded-2xl h-[90vh] sm:h-auto sm:max-h-[600px] flex flex-col sm:flex-row">
                    {/* Image Section - Large and Square-ish */}
                    <div className="w-full sm:w-1/2 bg-slate-100 flex items-center justify-center p-6 lg:p-10 relative">
                        <div className="relative w-full aspect-square max-w-[350px] shadow-xl rounded-lg overflow-hidden border-4 border-white transform transition-transform hover:scale-[1.02] duration-500">
                            {selectedPro?.avatarUrl ? (
                                <img src={selectedPro.avatarUrl} alt={selectedPro.publicName || selectedPro.name} className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full bg-muted flex items-center justify-center">
                                    <User className="h-24 w-24 text-muted-foreground/50" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className="w-full sm:w-1/2 p-6 lg:p-10 flex flex-col justify-center text-center sm:text-left overflow-y-auto flex-1 sm:flex-none">
                        <DialogHeader>
                            <DialogTitle className="text-3xl lg:text-4xl font-extrabold mb-2 text-primary tracking-tight text-center sm:text-left">{selectedPro?.publicName || selectedPro?.name}</DialogTitle>
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
            </Dialog >

            {/* Services */}



            {/* Professionals Section */}
            {filteredProfessionals && filteredProfessionals.length > 0 && (
                <section id="profesionales" className="py-16 md:py-24 bg-white">
                    <div className="container px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestro Equipo</h2>
                            <p className="text-muted-foreground">Expertos listos para atenderte.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 justify-center max-w-6xl mx-auto">
                            {filteredProfessionals.map((pro: any) => (
                                <Card key={pro.id} className="overflow-hidden border-none shadow-md hover:shadow-xl transition-all text-center bg-slate-50">
                                    <div className="relative w-full aspect-square overflow-hidden bg-slate-200 group">
                                        {pro.avatarUrl ? (
                                            <img
                                                src={pro.avatarUrl}
                                                alt={pro.publicName || pro.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                <User className="h-20 w-20" />
                                            </div>
                                        )}
                                        {/* Overlay with Booking Action */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                            <Button variant="secondary" className="font-semibold" onClick={() => setSelectedPro(pro)}>
                                                <Eye className="mr-2 h-4 w-4" /> Ver Perfil
                                            </Button>
                                        </div>
                                    </div>

                                    <CardFooter className="p-4 justify-center">
                                        <Button className="w-full shadow-sm hover:shadow-md transition-all" onClick={() => router.push(`/reservar?professionalId=${pro.id}`)}>
                                            Reservar
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            < section id="servicios" className="py-16 md:py-24 bg-muted/30" >
                <div className="container px-4 md:px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestros Servicios</h2>
                        <p className="text-muted-foreground">Calidad y detalle en cada corte.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                        {regularServices.map((service: any) => {
                            const count = getCount(service.id);
                            const isSelected = count > 0;

                            return (
                                <Card
                                    key={service.id}
                                    className={cn(
                                        "group flex flex-row items-center cursor-pointer transition-all duration-200 border-none shadow-sm hover:shadow-md bg-white overflow-hidden p-2",
                                        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-slate-50"
                                    )}
                                    onClick={() => setSelectedService(service)}
                                >
                                    {/* Small Square Image/Icon */}
                                    <div className="h-16 w-16 md:h-20 md:w-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-100 relative">
                                        {service.images && service.images.length > 0 ? (
                                            <img
                                                src={service.images[0]}
                                                alt={service.name}
                                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-slate-300">
                                                <Scissors className="h-8 w-8" />
                                            </div>
                                        )}
                                        {/* Optional "Added" indicator overlay if selected */}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                                                <div className="bg-primary text-primary-foreground rounded-full p-1 shadow-sm">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 ml-4 flex flex-col justify-center min-w-0">
                                        <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition-colors truncate pr-2">
                                            {service.name}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="font-bold text-lg text-slate-900">{formatPrice(service.price)}</span>
                                            {service.oldPrice && <span className="text-xs text-muted-foreground line-through">{formatPrice(service.oldPrice)}</span>}
                                        </div>
                                    </div>

                                    {/* Simple Arrow or Action Icon */}
                                    <div className="pr-2 md:pr-4 text-muted-foreground/50 group-hover:text-primary transition-colors">
                                        <ChevronRight className="h-6 w-6" />
                                    </div>
                                </Card>
                            );
                        })}
                        {regularServices.length === 0 && !loadingServices && (
                            <div className="col-span-full text-center text-muted-foreground p-10 border rounded-lg border-dashed">
                                No hay servicios disponibles en este momento.
                            </div>
                        )}
                    </div>
                </div>
            </section >

            {/* Packages Section */}
            {
                packageServices.length > 0 && (
                    <section id="paquetes" className="py-16 md:py-24 bg-white">
                        <div className="container px-4 md:px-6">
                            <div className="text-center mb-12">
                                <h2 className="text-3xl font-bold tracking-tight mb-2">Paquetes</h2>
                                <p className="text-muted-foreground">Las mejores combinaciones para ti.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                                {packageServices.map((service: any) => {
                                    const count = getCount(service.id);
                                    const isSelected = count > 0;

                                    return (
                                        <Card
                                            key={service.id}
                                            className={cn(
                                                "group flex flex-row items-center cursor-pointer transition-all duration-200 border-none shadow-sm hover:shadow-md bg-slate-50 overflow-hidden p-2",
                                                isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-slate-100"
                                            )}
                                            onClick={() => setSelectedService(service)}
                                        >
                                            <div className="h-16 w-16 md:h-20 md:w-20 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 border border-slate-200 relative">
                                                {service.images && service.images.length > 0 ? (
                                                    <img
                                                        src={service.images[0]}
                                                        alt={service.name}
                                                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-slate-400">
                                                        <Scissors className="h-8 w-8" />
                                                    </div>
                                                )}
                                                {isSelected && (
                                                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                                                        <div className="bg-primary text-primary-foreground rounded-full p-1 shadow-sm">
                                                            <Check className="h-4 w-4" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 ml-4 flex flex-col justify-center min-w-0">
                                                <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition-colors truncate pr-2">
                                                    {service.name}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="font-bold text-lg text-slate-900">{formatPrice(service.price)}</span>
                                                    {service.oldPrice && <span className="text-xs text-muted-foreground line-through">{formatPrice(service.oldPrice)}</span>}
                                                </div>
                                            </div>

                                            <div className="pr-2 md:pr-4 text-muted-foreground/50 group-hover:text-primary transition-colors">
                                                <ChevronRight className="h-6 w-6" />
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                )
            }

            {/* Products Section */}
            {
                products && products.length > 0 && (
                    <section id="productos" className="py-16 md:py-24 container px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tight mb-2">Productos Destacados</h2>
                            <p className="text-muted-foreground">Lleva la experiencia de la barbería a tu casa.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                            {products.filter((p: any) => p.active && (p.stock > 0 || p.stock === undefined)).map((product: any) => {
                                const pCount = getProductCount(product.id);
                                const isPSelected = pCount > 0;

                                return (
                                    <Card
                                        key={product.id}
                                        className={cn(
                                            "group flex flex-row items-center cursor-pointer transition-all duration-200 border-none shadow-sm hover:shadow-md bg-white overflow-hidden p-2",
                                            isPSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-slate-50"
                                        )}
                                        onClick={() => setSelectedProduct(product)}
                                    >
                                        <div className="h-16 w-16 md:h-20 md:w-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-100 relative">
                                            {product.images && product.images.length > 0 ? (
                                                <img
                                                    src={product.images[0]}
                                                    alt={product.nombre}
                                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-slate-300">
                                                    <ShoppingBag className="h-8 w-8" />
                                                </div>
                                            )}

                                            {/* Quantity Badge if selected */}
                                            {isPSelected && (
                                                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                                                    <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center shadow-sm text-xs font-bold">
                                                        {pCount}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 ml-4 flex flex-col justify-center min-w-0">
                                            <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition-colors truncate pr-2">
                                                {product.nombre}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="font-bold text-lg text-slate-900">{formatPrice(product.public_price)}</span>
                                            </div>
                                        </div>

                                        <div className="pr-2 md:pr-4 text-muted-foreground/50 group-hover:text-primary transition-colors">
                                            <ChevronRight className="h-6 w-6" />
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    </section>
                )
            }

            {/* Promotions Section */}
            {
                activePromotions && activePromotions.length > 0 && (
                    <section id="promociones" className="py-16 md:py-24 bg-slate-50 border-t">
                        <div className="container px-4 md:px-6">
                            <div className="text-center mb-12">
                                <h2 className="text-3xl font-bold tracking-tight mb-2">Nuestras Promociones</h2>
                                <p className="text-muted-foreground">Aprovecha nuestras ofertas exclusivas.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                                {activePromotions.map((promo: any) => (
                                    <Card key={promo.id} className="overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-none group">
                                        <div className="relative aspect-square w-full bg-slate-200 overflow-hidden">
                                            {promo.imageUrl ? (
                                                <img
                                                    src={promo.imageUrl}
                                                    alt={promo.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-slate-100">
                                                    <ShoppingBag className="h-16 w-16 opacity-20" />
                                                </div>
                                            )}
                                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                                                Oferta
                                            </div>
                                        </div>
                                        <CardContent className="p-6">
                                            <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{promo.name}</h3>
                                            <div className="flex items-center text-sm text-muted-foreground mb-4">
                                                <Clock className="w-4 h-4 mr-1" />
                                                <span>
                                                    {(() => {
                                                        const formatDate = (date: any) => {
                                                            if (!date) return null;
                                                            if (typeof date === 'string') return parseISO(date);
                                                            if (date.toDate) return date.toDate();
                                                            return date;
                                                        };

                                                        const start = formatDate(promo.startDate);
                                                        const end = formatDate(promo.endDate);

                                                        if (start && end) {
                                                            return `Del ${format(start, "d 'de' MMMM", { locale: es })} al ${format(end, "d 'de' MMMM 'de' yyyy", { locale: es })}`;
                                                        } else if (end) {
                                                            return `Válido hasta: ${format(end, "d 'de' MMMM 'de' yyyy", { locale: es })}`;
                                                        }
                                                        return 'Tiempo limitado';
                                                    })()}
                                                </span>
                                            </div>
                                            <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                                                {promo.description}
                                            </p>
                                            {promo.termsAndConditions && (
                                                <div className="mb-4">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedPromotion(promo);
                                                        }}
                                                        className="text-xs text-primary underline hover:text-primary/80 transition-colors"
                                                    >
                                                        Ver términos y condiciones
                                                    </button>
                                                </div>
                                            )}
                                        </CardContent>
                                        <CardFooter className="p-6 pt-0">
                                            <Button className="w-full" onClick={() => router.push('/reservar')}>
                                                Reservar Ahora
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </section>
                )
            }

            {/* Service Details Modal */}
            <Dialog open={!!selectedService} onOpenChange={(open) => !open && setSelectedService(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl overflow-hidden p-0 bg-white rounded-xl sm:rounded-2xl h-[90vh] sm:h-auto sm:max-h-[600px] flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/2 h-56 sm:h-auto bg-slate-50 flex items-center justify-center p-0 relative shrink-0">
                        <div className="relative w-full h-full bg-slate-100 flex items-center justify-center overflow-hidden">
                            {selectedService?.images && selectedService.images.length > 0 ? (
                                <img src={selectedService.images[0]} alt={selectedService.name} className="h-full w-full object-contain p-2" />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-slate-200">
                                    <Scissors className="h-24 w-24 text-muted-foreground/30" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full sm:w-1/2 p-6 lg:p-10 flex flex-col justify-between overflow-y-auto flex-1 sm:flex-none">
                        <div>
                            <DialogHeader>
                                <DialogTitle className="text-2xl lg:text-3xl font-extrabold mb-2 tracking-tight">{selectedService?.name}</DialogTitle>
                            </DialogHeader>

                            <div className="flex items-baseline justify-between mb-4 border-b pb-4">
                                <span className="text-3xl font-bold text-primary">{selectedService ? formatPrice(selectedService.price) : ''}</span>
                                <div className="flex items-center text-muted-foreground gap-1">
                                    <Clock className="h-4 w-4" />
                                    <span className="text-sm font-medium">{selectedService?.duration} min</span>
                                </div>
                            </div>

                            {selectedService?.payment_type === 'online-deposit' && (
                                <div className="mb-6">
                                    <span className="text-sm text-amber-700 font-medium bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200 flex items-center w-full justify-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                        {(() => {
                                            const type = selectedService.payment_amount_type || '%';
                                            const val = selectedService.payment_amount_value;
                                            if (type === '$' && val) return `Requiere anticipo de $${val}`;
                                            if (type === '%' && val) return `Requiere anticipo del ${val}%`;
                                            return 'Requiere anticipo del 50%';
                                        })()}
                                    </span>
                                </div>
                            )}

                            <div className="prose prose-sm text-muted-foreground leading-relaxed text-base mb-6">
                                <h4 className="font-semibold text-foreground mb-2">Descripción del servicio</h4>
                                {selectedService?.description ? (
                                    <p className="whitespace-pre-line">{selectedService.description}</p>
                                ) : (
                                    <p className="italic text-slate-400">Sin descripción detallada disponible.</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t">
                            <Button className="w-full shadow-lg hover:shadow-xl transition-all h-14 text-lg" onClick={() => {
                                addToCart(selectedService.id);
                                setSelectedService(null);
                            }}>
                                <Plus className="mr-2 h-5 w-5" /> Agregar y Seguir Explorando
                            </Button>
                            <Button variant="outline" className="w-full mt-3 h-12" onClick={() => setSelectedService(null)}>
                                Volver a Servicios
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Product Details Modal */}
            <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl overflow-hidden p-0 bg-white rounded-xl sm:rounded-2xl h-[90vh] sm:h-auto sm:max-h-[600px] flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/2 h-56 sm:h-auto bg-slate-50 flex items-center justify-center p-0 relative shrink-0">
                        <div className="relative w-full h-full bg-slate-100 flex items-center justify-center overflow-hidden">
                            {selectedProduct?.images && selectedProduct.images.length > 0 ? (
                                <img src={selectedProduct.images[0]} alt={selectedProduct.nombre} className="h-full w-full object-contain p-4" />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-slate-200">
                                    <ShoppingBag className="h-24 w-24 text-muted-foreground/30" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full sm:w-1/2 p-6 lg:p-10 flex flex-col justify-between overflow-y-auto flex-1 sm:flex-none">
                        <div>
                            <DialogHeader>
                                <DialogTitle className="text-2xl lg:text-3xl font-extrabold mb-2 tracking-tight">{selectedProduct?.nombre}</DialogTitle>
                            </DialogHeader>

                            <div className="flex items-baseline justify-between mb-4 border-b pb-4">
                                <span className="text-3xl font-bold text-primary">{selectedProduct ? formatPrice(selectedProduct.public_price) : ''}</span>
                            </div>

                            {selectedProduct?.payment_type === 'deposit' && (
                                <div className="mb-6">
                                    <span className="text-sm text-amber-700 font-medium bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200 flex items-center w-full justify-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                        {(() => {
                                            const type = selectedProduct.payment_amount_type || '%';
                                            const val = selectedProduct.payment_amount_value;
                                            if (type === '$' && val) return `Requiere anticipo de $${val}`;
                                            if (type === '%' && val) return `Requiere anticipo del ${val}%`;
                                            return 'Requiere anticipo';
                                        })()}
                                    </span>
                                </div>
                            )}

                            <div className="prose prose-sm text-muted-foreground leading-relaxed text-base mb-6">
                                <h4 className="font-semibold text-foreground mb-2">Descripción del producto</h4>
                                {selectedProduct?.description ? (
                                    <p className="whitespace-pre-line">{selectedProduct.description}</p>
                                ) : (
                                    <p className="italic text-slate-400">Sin descripción detallada disponible.</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t">
                            <Button className="w-full shadow-lg hover:shadow-xl transition-all h-14 text-lg" onClick={() => {
                                addToProductCart(selectedProduct.id);
                                setSelectedProduct(null);
                            }}>
                                <ShoppingBag className="mr-2 h-5 w-5" /> Agregar al Pedido
                            </Button>
                            <Button variant="outline" className="w-full mt-3 h-12" onClick={() => setSelectedProduct(null)}>
                                Volver a Productos
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Promotion Terms Modal */}
            <Dialog open={!!selectedPromotion} onOpenChange={(open) => !open && setSelectedPromotion(null)}>
                <DialogContent className="max-w-md bg-white p-6 rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">{selectedPromotion?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <h4 className="font-semibold text-sm mb-2 text-primary">Términos y Condiciones:</h4>
                        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm text-slate-700 bg-slate-50 p-4 rounded-lg border">
                            {selectedPromotion?.termsAndConditions || 'No hay términos y condiciones específicos para esta promoción.'}
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <Button onClick={() => setSelectedPromotion(null)}>
                            Cerrar
                        </Button>
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
                            <Button size="lg" className="h-14 px-8 text-lg shadow-lg" onClick={handleBooking} disabled={isBooking}>
                                {isBooking ? (
                                    <CustomLoader size={24} className="text-primary-foreground" />
                                ) : cart.length > 0 ? (
                                    <>Confirmar Reserva <ArrowRight className="ml-2 h-5 w-5" /></>
                                ) : (
                                    <>Comprar Productos <ShoppingBag className="ml-2 h-5 w-5" /></>
                                )}
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* Locations / Branches Section */}
            {
                locales && locales.length > 0 && (
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
                                                <p className="flex items-center gap-2">
                                                    <span className="font-semibold text-foreground">Teléfono:</span>
                                                    <a
                                                        href={`https://wa.me/52${local.phone.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1.5 hover:text-green-600 hover:underline transition-colors"
                                                    >
                                                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-500 fill-current" fill="currentColor" role="img" xmlns="http://www.w3.org/2000/svg"><title>WhatsApp</title><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1-5.106c0-5.445 4.406-9.885 9.885-9.885 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.444-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                                                        {local.phone}
                                                    </a>
                                                </p>
                                                <p className="flex items-center gap-2">
                                                    <span className="font-semibold text-foreground">Horario:</span>
                                                    {local.schedule ? (() => {
                                                        const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
                                                        const todayIndex = new Date().getDay();
                                                        const todayKey = days[todayIndex];
                                                        const schedule = local.schedule[todayKey];

                                                        return (
                                                            <span className="text-muted-foreground">
                                                                {schedule?.enabled ? `${schedule.start} - ${schedule.end}` : 'Cerrado hoy'}
                                                            </span>
                                                        );
                                                    })() : (
                                                        <span className="text-muted-foreground">Lunes a Sábado: 10:00 - 20:00</span>
                                                    )}
                                                </p>
                                            </div>
                                        </CardContent>
                                        <CardFooter>
                                            <Button variant="outline" className="w-full" asChild>
                                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${companyName} ${local.address}`)}`} target="_blank" rel="noopener noreferrer">
                                                    Ver en Mapa
                                                </a>
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </section>
                )
            }

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

            {/* Floating Navigation Bar */}
            <div className={cn("fixed left-0 right-0 z-40 flex justify-center pointer-events-none px-4 transition-all duration-300", totalItems > 0 ? "bottom-24" : "bottom-6")}>
                <div className="flex items-center gap-1 sm:gap-2 bg-slate-900/90 backdrop-blur-md text-white border border-slate-700 shadow-2xl rounded-full p-1.5 pointer-events-auto overflow-x-auto max-w-full no-scrollbar">
                    <Link href="#servicios">
                        <Button size="sm" variant="ghost" className="rounded-full hover:bg-white/20 hover:text-white text-white/90 h-8 px-3 sm:px-4 text-xs sm:text-sm font-medium transition-all">
                            Servicios
                        </Button>
                    </Link>
                    <Link href="#productos">
                        <Button size="sm" variant="ghost" className="rounded-full hover:bg-white/20 hover:text-white text-white/90 h-8 px-3 sm:px-4 text-xs sm:text-sm font-medium transition-all">
                            Productos
                        </Button>
                    </Link>
                    <Link href="#profesionales">
                        <Button size="sm" variant="ghost" className="rounded-full hover:bg-white/20 hover:text-white text-white/90 h-8 px-3 sm:px-4 text-xs sm:text-sm font-medium transition-all">
                            Profesionales
                        </Button>
                    </Link>
                    {activePromotions && activePromotions.length > 0 && (
                        <Link href="#promociones">
                            <Button size="sm" variant="ghost" className="rounded-full hover:bg-white/20 hover:text-white text-white/90 h-8 px-3 sm:px-4 text-xs sm:text-sm font-medium transition-all">
                                Promociones
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </div >
    );
}
