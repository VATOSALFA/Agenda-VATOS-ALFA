'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import { getBranchOperationalStatus } from '@/lib/branch-status';
import Link from 'next/link';
import { ArrowRight, Scissors, User, Plus, Minus, ShoppingBag, Eye, MapPin, ChevronDown, Clock, Check, ChevronRight, Image as ImageIcon, Sparkles, Star, Video, Info, X, Share2, ExternalLink, Calendar, Users, Award, Bot, Smartphone, Menu, BookOpen } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { VatosButton } from '@/components/ui/vatos-button';
import { ParallaxHero } from '@/components/ui/parallax-hero';
import { toast } from '@/hooks/use-toast';
import Image from 'next/image';
import { AlfaServicesSection } from '@/components/ui/alfa-services-section';
import { AlfaHeroBackground } from '@/components/ui/alfa-hero-background';
import { ScrollProgressBar } from '@/components/ui/scroll-progress-bar';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { getServiceLocalImage } from '@/lib/service-images';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { AlfaFloatingBottomBar } from '@/components/ui/alfa-floating-bottom-bar';

const Team360Gallery = dynamic(() => import('@/components/ui/team-360-gallery').then((m) => m.Team360Gallery), {
    ssr: false,
    loading: () => <div className="min-h-[480px] w-full flex items-center justify-center" />,
});
const Alfa3DCarousel = dynamic(() => import('@/components/ui/alfa-3d-carousel').then((m) => m.Alfa3DCarousel), {
    ssr: false,
    loading: () => <div className="min-h-[420px] w-full" />,
});
const AlfaProductsSection = dynamic(() => import('@/components/ui/alfa-products-section').then((m) => m.AlfaProductsSection), {
    ssr: false,
    loading: () => <div className="min-h-[350px] w-full" />,
});
const AlfaBenefitsSection = dynamic(() => import('@/components/ui/alfa-benefits-section').then((m) => m.AlfaBenefitsSection), {
    ssr: false,
    loading: () => <div className="min-h-[400px] w-full" />,
});
const JanetChatModal = dynamic(() => import('@/components/ui/janet-chat-modal').then((m) => m.JanetChatModal), {
    ssr: false,
});
const AlfaGoldSmokeBurst = dynamic(() => import('@/components/ui/alfa-gold-smoke-burst').then((m) => m.AlfaGoldSmokeBurst), {
    ssr: false,
});
const VerticalSectionNavigator = dynamic(() => import('@/components/ui/vertical-section-navigator').then((m) => m.VerticalSectionNavigator), {
    ssr: false,
});
const FloatingMenu = dynamic(() => import('@/components/ui/floating-menu'), { ssr: false });
const AppDownloadModal = dynamic(() => import('@/components/ui/app-download-modal').then((m) => m.AppDownloadModal), {
    ssr: false,
});


// Hook moved inside component
const isVideo = (url?: string) => {
    if (!url) return false;
    return url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.webm') || (url.toLowerCase().includes('alt=media') && url.includes('video'));
};

const getPackageDescription = (name: string) => {
    const cleanName = name.toLowerCase().trim();
    if (cleanName.includes('héroe en descanso') || cleanName.includes('heroe en descanso')) {
        return "Corte de cabello + arreglo de ceja + lavado de cabello + facial completo con masajeador relajante, spa y aceites.";
    }
    if (cleanName.includes('renovación alfa') || cleanName.includes('renovacion alfa')) {
        return "Corte de cabello + facial completo con masajeador relajante, spa y aceites.";
    }
    if (cleanName.includes('caballero alfa')) {
        return "Corte de cabello + arreglo de barba, afeitado clásico con toalla caliente.";
    }
    if (cleanName.includes('alfa superior')) {
        return "Corte de cabello + arreglo de barba, afeitado clásico con toalla caliente + facial completo con masajeador relajante, spa y aceites.";
    }
    if (cleanName.includes('todo para el campeón') || cleanName.includes('todo para el campeon')) {
        return "Corte de cabello + arreglo de barba, afeitado clásico con toalla caliente + arreglo de ceja + lavado de cabello + facial completo con masajeador relajante, spa y aceites.";
    }
    return null;
};



// Lazy video component using IntersectionObserver
function LazyVideo({ src, className, cover = true, muted = true, loop = true, playsInline = true, controls = false, onError }: { src: string; className?: string; cover?: boolean; muted?: boolean; loop?: boolean; playsInline?: boolean; controls?: boolean; onError?: () => void }) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [isVisible, setIsVisible] = React.useState(false);

    React.useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );
        if (videoRef.current) {
            observer.observe(videoRef.current);
        }
        return () => observer.disconnect();
    }, []);

    return (
        <video
            ref={videoRef}
            src={isVisible ? src : undefined}
            className={cn(cover ? 'object-cover' : 'object-contain', 'w-full h-full', className)}
            autoPlay={isVisible}
            muted={muted}
            loop={loop}
            playsInline={playsInline}
            controls={controls}
            preload="none"
            onError={onError}
        />
    );
}

// Robust media component: tries video, falls back to image on error
function PromoMedia({ url, name, className, cover = true, muted = true, controls = false }: { url: string; name: string; className?: string; cover?: boolean; muted?: boolean; controls?: boolean }) {
    const [videoFailed, setVideoFailed] = React.useState(false);
    const isVid = isVideo(url) && !videoFailed;

    if (isVid) {
        return (
            <LazyVideo
                src={url}
                className={className}
                cover={cover}
                muted={muted}
                controls={controls}
                onError={() => setVideoFailed(true)}
            />
        );
    }

    // Show optimized Next.js Image component
    return (
        <div className="relative w-full h-full">
            <Image
                src={url}
                alt={name}
                fill
                sizes="(max-width: 768px) 150px, 300px"
                className={cn(cover ? 'object-cover' : 'object-contain', className)}
                loading="lazy"
                onError={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.parentElement) {
                        target.parentElement.style.display = 'none';
                    }
                }}
            />
        </div>
    );
}

export default function LandingPageClient() {
    const { data: services, loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: professionals, loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const { data: products, loading: loadingProducts } = useFirestoreQuery<any>('productos');
    const { data: empresa, loading: loadingEmpresa } = useFirestoreQuery<any>('empresa');
    const { data: locales, loading: loadingLocales } = useFirestoreQuery<any>('locales');
    const { data: settingsData, loading: loadingSettings } = useFirestoreQuery<any>('settings');
    const { data: categories } = useFirestoreQuery<any>('categorias_servicios');
    const { data: promotions } = useFirestoreQuery<any>('promociones');

    // Filter active promotions (active and not expired)
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const activePromotions = promotions?.filter((p: any) => p.active && (!p.endDate || today <= p.endDate)) || [];

    // Sort and filter services
    const sortedServices = services?.filter((s: any) => s.active && s.visible_en_web !== false).sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999)) || [];

    // Identify Package Categories
    const packageCategoryIds = categories?.filter((c: any) => c.name.toLowerCase().includes('paquete') || c.name.toLowerCase().includes('package')).map((c: any) => c.id) || [];

    const regularServices = sortedServices.filter((s: any) => !packageCategoryIds.includes(s.category));
    const packageServices = sortedServices.filter((s: any) => packageCategoryIds.includes(s.category));


    const router = useRouter();
    const searchParams = useSearchParams();
    const isPreview = searchParams.get('preview') === 'true';
    const { user, loading: authLoading } = useAuth();

    // Check if user is logged in to redirect to admin side
    useEffect(() => {
        if (!authLoading && user && !isPreview) {
            router.push('/agenda');
        }
    }, [user, authLoading, router, isPreview]);

    // Cart stored as array of Service IDs to allow multiples
    const [cart, setCart] = useState<string[]>([]);
    const [isBooking, setIsBooking] = useState(false);
    const [productCart, setProductCart] = useState<string[]>([]); // New: Product Cart
    const [selectedPro, setSelectedPro] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null); // New: Selected Product
    const [selectedService, setSelectedService] = useState<any>(null); // New: Selected Service
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedPromotion, setSelectedPromotion] = useState<any>(null);
    const [showTerms, setShowTerms] = useState<any>(null);
    const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
    const [termsModalOpen, setTermsModalOpen] = useState(false);
    const [isJanetChatOpen, setIsJanetChatOpen] = useState(false);
    const [isAppDownloadOpen, setIsAppDownloadOpen] = useState(false);

    // Galería de Cortes Reales en vivo (sincronizada en espejo con App Móvil y Sitio Web)
    const [cortesReales, setCortesReales] = useState<any[]>([]);
    useEffect(() => {
        let isMounted = true;
        async function fetchCortesReales() {
            // 1. Probar primero configuracion/app_movil (autorizado públicamente en reglas de Firestore)
            try {
                const appMovilRef = doc(db, 'configuracion', 'app_movil');
                const appSnap = await getDoc(appMovilRef);
                if (appSnap.exists() && Array.isArray(appSnap.data().inspiracion_alfa) && appSnap.data().inspiracion_alfa.length > 0) {
                    const activeItems = appSnap.data().inspiracion_alfa.filter((item: any) => item.activo !== false);
                    if (activeItems.length > 0 && isMounted) {
                        setCortesReales(activeItems);
                        return;
                    }
                }
            } catch (appErr) {
                console.warn('Cortes reales fallback from app_movil notice:', appErr);
            }

            // 2. Probar configuracion/inspiracion_alfa
            try {
                const docRef = doc(db, 'configuracion', 'inspiracion_alfa');
                const snap = await getDoc(docRef);
                if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length > 0) {
                    const activeItems = snap.data().items.filter((item: any) => item.activo !== false);
                    if (activeItems.length > 0 && isMounted) {
                        setCortesReales(activeItems);
                        return;
                    }
                }
            } catch (err) {
                console.warn('Cortes reales fallback from inspiracion_alfa notice:', err);
            }
        }
        fetchCortesReales();
        return () => {
            isMounted = false;
        };
    }, []);

    // Configuración y Beneficios de Pase Alfa en vivo (sincronizada en espejo con App Móvil y Sitio Web)
    const [paseAlfaConfig, setPaseAlfaConfig] = useState<any>(null);
    useEffect(() => {
        let isMounted = true;
        async function fetchPaseAlfaConfig() {
            try {
                // 1. Probar configuracion/pase_alfa
                const paRef = doc(db, 'configuracion', 'pase_alfa');
                const paSnap = await getDoc(paRef);
                if (paSnap.exists() && isMounted) {
                    setPaseAlfaConfig(paSnap.data());
                    return;
                }
            } catch (err) {
                console.warn('Pase Alfa config fetch from configuracion/pase_alfa notice:', err);
            }

            try {
                // 2. Probar configuracion/app_movil (campo pase_alfa)
                const appMovilRef = doc(db, 'configuracion', 'app_movil');
                const appSnap = await getDoc(appMovilRef);
                if (appSnap.exists() && appSnap.data().pase_alfa && isMounted) {
                    setPaseAlfaConfig(appSnap.data().pase_alfa);
                    return;
                }
            } catch (err) {
                console.warn('Pase Alfa config fallback notice:', err);
            }
        }
        fetchPaseAlfaConfig();
        return () => {
            isMounted = false;
        };
    }, []);

    // Auto-select branch if only one exists or set default
    useEffect(() => {
        if (locales && locales.length > 0 && !selectedBranch) {
            const activeLocales = locales.filter((l: any) => l.status === 'active');
            if (activeLocales.length > 0) {
                setSelectedBranch(activeLocales[0].id);
            }
        }
    }, [locales, selectedBranch]);

    const activeLocales = locales?.filter((l: any) => l.status === 'active') || [];
    const currentBranchObj = activeLocales.find((l: any) => l.id === selectedBranch);
    const currentBranchName = currentBranchObj
        ? (currentBranchObj.name?.toLowerCase().includes('sombrerete') || currentBranchObj.name?.includes('Suc1') ? 'Sucursal Sombrerete' : currentBranchObj.name)
        : 'Sucursal Sombrerete';

    // Reactividad en tiempo real para el horario y estado de apertura de la sucursal
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 30000); // Recalcula cada 30 segundos
        return () => clearInterval(timer);
    }, []);

    const defaultBranchFallback = useMemo(() => ({
        name: 'Sucursal Sombrerete',
        address: 'Av. Sombrerete 1001, Col. Cipreses, Querétaro',
        phone: '4428727279',
        timezone: 'America/Mexico_City',
        schedule: {
            lunes: { active: true, open: '10:00', close: '20:00' },
            martes: { active: true, open: '10:00', close: '20:00' },
            miercoles: { active: true, open: '10:00', close: '20:00' },
            jueves: { active: true, open: '10:00', close: '20:00' },
            viernes: { active: true, open: '10:00', close: '20:00' },
            sabado: { active: true, open: '10:00', close: '20:00' },
            domingo: { active: false, open: '10:00', close: '15:00' },
        }
    }), []);

    const effectiveBranchObj = currentBranchObj || defaultBranchFallback;

    const branchStatus = useMemo(() => {
        return getBranchOperationalStatus(effectiveBranchObj, currentTime);
    }, [effectiveBranchObj, currentTime]);

    const isLoading = loadingServices || loadingEmpresa || loadingLocales || loadingSettings || authLoading;

    const websiteSettings = settingsData?.find((d: any) => d.id === 'website') || {};
    const companyName = empresa?.[0]?.name || 'VATOS ALFA Barber Shop';
    const companySlogan = websiteSettings.slogan || empresa?.[0]?.slogan || 'No es solo un corte. Es tu mejor versión.';
    const heroDescription = websiteSettings.heroDescription || 'Agenda tu cita en segundos con nuestros Master Barbers. Cortes clásicos, fades de alta precisión y el tradicional ritual de toalla caliente.';
    const companyDescription = websiteSettings.description || empresa?.[0]?.description || 'En VATOS ALFA Barber Shop dominamos desde los cortes clásicos y desvanecidos (fades) más limpios, hasta el perfilado de barba con el tradicional ritual de toalla caliente. Utilizamos productos de la más alta calidad para garantizar un acabado impecable. Si buscas un cambio de imagen profesional, estás en el lugar correcto.';
    const logoUrl = empresa?.[0]?.logo_url;
    const iconUrl = empresa?.[0]?.icon_url;

    // Calificación dinámica de Google Maps sincronizada con la sucursal activa
    const [googleRatingData, setGoogleRatingData] = useState<{
        rating: number;
        userRatingCount: number | null;
        googleMapsUri: string;
    }>({
        rating: Number(currentBranchObj?.googleRating || websiteSettings?.googleRating || 4.9),
        userRatingCount: currentBranchObj?.googleReviewCount || websiteSettings?.googleReviewCount || null,
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('VATOS ALFA Barber Shop Av. Sombrerete 1001, Col. Cipreses, Querétaro')}`,
    });

    useEffect(() => {
        let isMounted = true;
        const branchQuery = currentBranchObj?.address
            ? `${companyName} ${currentBranchObj.address}`
            : 'VATOS ALFA Barber Shop Av. Sombrerete 1001, Col. Cipreses, Querétaro';
        const branchPlaceId = currentBranchObj?.placeId || currentBranchObj?.google_place_id || websiteSettings?.googlePlaceId || '';

        fetch(`/api/google-rating?query=${encodeURIComponent(branchQuery)}${branchPlaceId ? `&placeId=${encodeURIComponent(branchPlaceId)}` : ''}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!isMounted || !data) return;
                const customRating = Number(currentBranchObj?.googleRating || websiteSettings?.googleRating);
                setGoogleRatingData({
                    rating: (data.source !== 'fallback' && typeof data.rating === 'number')
                        ? data.rating
                        : (!isNaN(customRating) && customRating > 0 ? customRating : (data.rating || 4.9)),
                    userRatingCount: data.userRatingCount ?? currentBranchObj?.googleReviewCount ?? websiteSettings?.googleReviewCount ?? null,
                    googleMapsUri: data.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branchQuery)}`,
                });
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
    }, [currentBranchObj, companyName, websiteSettings?.googleRating, websiteSettings?.googleReviewCount, websiteSettings?.googlePlaceId]);

    // Segmenta el slogan para aplicar el acento de degradado azul institucional a la segunda parte
    const sloganParts = useMemo(() => {
        const text = (companySlogan || '').trim();
        if (!text) return { first: 'No es solo un corte.', second: 'Es tu mejor versión.' };
        if (text.includes('.')) {
            const dotIndex = text.indexOf('.');
            return {
                first: text.slice(0, dotIndex + 1),
                second: text.slice(dotIndex + 1).trim()
            };
        }
        const words = text.split(' ');
        if (words.length > 2) {
            const mid = Math.ceil(words.length / 2);
            return {
                first: words.slice(0, mid).join(' '),
                second: words.slice(mid).join(' ')
            };
        }
        return { first: text, second: '' };
    }, [companySlogan]);

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
    /* Fallback and Metadata constants moved up */

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
    let filteredProfessionals = professionals?.filter((p: any) => p.active && !p.deleted && p.acceptsOnline && (!selectedBranch || p.local_id === selectedBranch)) || [];
    
    // Manual reorder: Swap 1st (index 0) and 3rd (index 2) positions as requested
    if (filteredProfessionals.length >= 3) {
        const result = [...filteredProfessionals];
        const temp = result[0];
        result[0] = result[2];
        result[2] = temp;
        filteredProfessionals = result;
    }

    const heroRef = useRef<HTMLElement>(null);
    const { scrollYProgress: heroScroll } = useScroll({
        target: heroRef,
        offset: ['start start', 'end start'],
    });

    // Suavizado cinemático con física de resortes para eliminar brincos y micro-tirones en pantallas táctiles de celulares
    const smoothHeroScroll = useSpring(heroScroll, {
        stiffness: 260,
        damping: 32,
        mass: 0.15,
        restDelta: 0.001,
    });

    // Traslación directa en píxeles acelerada por GPU (evita recálculos de porcentaje y layout thrashing en móvil)
    const heroContentY = useTransform(smoothHeroScroll, [0, 1], [0, 180]);
    const heroContentOpacity = useTransform(smoothHeroScroll, [0, 0.60], [1, 0]);
    const heroContentScale = useTransform(smoothHeroScroll, [0, 0.75], [1, 0.90]);

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            const offset = 75;
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = el.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;
            const offsetPosition = elementPosition - offset;
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    };

    // Manejo inteligente de Descarga de App Móvil (tienda directa si está en celular y configurado, o modal)
    const effectivePlayStoreUrl = websiteSettings?.playStoreUrl || paseAlfaConfig?.play_store_url || '';
    const effectiveAppStoreUrl = websiteSettings?.appStoreUrl || paseAlfaConfig?.app_store_url || '';

    const handleAppDownloadClick = () => {
        if (typeof window === 'undefined') return;
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
        const isAndroid = /android/i.test(userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

        // Si es dispositivo móvil y tiene configurada la URL de la tienda correspondiente, abrir directamente
        if (isAndroid && effectivePlayStoreUrl) {
            window.open(effectivePlayStoreUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        if (isIOS && effectiveAppStoreUrl) {
            window.open(effectiveAppStoreUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        // En caso contrario (desktop o aún sin links asignados), abrir el modal oficial de descarga
        setIsAppDownloadOpen(true);
    };

    return (
        <ParallaxHero>
        <ScrollProgressBar />
        <div className="flex flex-col min-h-screen bg-background text-foreground animation-fade-in pb-20">

            {/* SEO & Bot Purpose Verification */}
            <div className="sr-only">
                <h2>VATOS ALFA Barber Shop - Plataforma de Reservas</h2>
                <p>Bienvenido a VATOS ALFA Barber Shop. En nuestra página principal podrás agendar citas de barbería, ver nuestro catálogo de productos y conocer a nuestros profesionales. Estamos ubicados en Santiago de Querétaro y ofrecemos servicios premium de corte de cabello y barba.</p>
                <nav>
                    <Link href="/blog" prefetch={false}>Blog</Link>
                    <Link href="/privacidad" prefetch={false}>Aviso de Privacidad</Link>
                    <Link href="/terminos" prefetch={false}>Términos y Condiciones</Link>
                </nav>
            </div>
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-muted/90 md:backdrop-blur md:supports-[backdrop-filter]:bg-muted/80">
                <div className="container flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        <Link href="/" prefetch={false} className="flex items-center gap-2">
                            <Image 
                                src="/logo-v-400x400.webp" 
                                alt="VATOS ALFA" 
                                width={36}
                                height={36}
                                priority
                                className="h-9 w-9 rounded-full object-cover border border-slate-300 aspect-square" 
                            />
                            <span className="hidden sm:inline-block">{companyName}</span>
                        </Link>
                    </div>

                    <div className="flex gap-2 sm:gap-3 items-center">
                        {/* 0. Botón Descargar App Oficial (Visible en tablet/desktop; en móvil va dentro del menú hamburguesa) */}
                        {websiteSettings.showAppDownload !== false && (
                            <button
                                type="button"
                                onClick={handleAppDownloadClick}
                                className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors py-1.5 px-2.5 sm:px-3 rounded-xl border border-slate-700/80 hover:border-blue-500/60 bg-slate-900/60 hover:bg-blue-600/10 cursor-pointer shadow-xs shrink-0"
                                title="Descargar App Móvil"
                                aria-label="Descargar App Móvil"
                            >
                                <Smartphone className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                <span>Descargar App</span>
                            </button>
                        )}

                        {/* 1. Botón Reservar Cita (Oficial Alfa) */}
                        <Link href="/reservar" prefetch={false}>
                            <Button 
                                variant="alfa" 
                                size="sm" 
                                className="h-9 px-3 sm:px-4 text-xs font-bold rounded-xl shadow-[0_4px_15px_rgba(32,42,73,0.6)] cursor-pointer shrink-0"
                            >
                                Reservar Cita
                            </Button>
                        </Link>

                        {/* 2. Sucursal (Sin contenedor, bare icon y texto limpio) */}
                        <Select 
                            value={selectedBranch} 
                            onValueChange={(val) => {
                                if (val === 'coming-soon') {
                                    toast({
                                        title: "Nueva Sucursal",
                                        description: "Próximamente anunciaremos nuestra nueva ubicación. Por ahora todas las citas se atienden en Sucursal Sombrerete.",
                                    });
                                    return;
                                }
                                setSelectedBranch(val);
                            }}
                        >
                            <SelectTrigger className="h-auto p-0 border-0 border-none bg-transparent hover:bg-transparent text-xs font-semibold text-foreground hover:text-blue-600 transition-colors shadow-none focus:ring-0 focus:outline-none focus-visible:ring-0 w-auto gap-1 cursor-pointer max-w-[130px] sm:max-w-none">
                                <div className="flex items-center gap-1 truncate">
                                    <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    <SelectValue placeholder="Suc. Sombrerete" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#0d1424] text-white">
                                {activeLocales.map((local: any) => {
                                    const displayName = local.name?.toLowerCase().includes('sombrerete') || local.name?.includes('Suc1')
                                        ? 'Suc. Sombrerete'
                                        : local.name;
                                    return (
                                        <SelectItem key={local.id} value={local.id} className="text-xs py-2 cursor-pointer focus:bg-blue-600/20 focus:text-white">
                                            {displayName}
                                        </SelectItem>
                                    );
                                })}
                                {/* Opción de otra sucursal si solo hay una en BD */}
                                {activeLocales.length <= 1 && (
                                    <SelectItem value="coming-soon" className="text-xs py-2 cursor-pointer text-slate-400 focus:bg-blue-600/20 focus:text-slate-300">
                                        Próximamente
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>

                        {/* 3. Derecha en Desktop: Blog */}
                        <Link href="/blog" prefetch={false} className="hidden md:inline-block text-sm font-medium hover:text-primary transition-colors text-muted-foreground hover:text-foreground">
                            Blog
                        </Link>

                        {/* 4. Menú Hamburguesa en Celular (md:hidden) */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus:outline-none shrink-0"
                                    aria-label="Abrir menú de navegación"
                                    title="Menú"
                                >
                                    <Menu className="h-5 w-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                sideOffset={8}
                                className="w-56 p-1.5 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#0d1424] text-white z-[100]"
                            >
                                <DropdownMenuItem
                                    onClick={() => scrollToSection('servicios')}
                                    className="text-xs font-medium py-2.5 px-3 rounded-lg cursor-pointer text-slate-200 focus:bg-blue-600/20 focus:text-white flex items-center gap-2.5"
                                >
                                    <Scissors className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span>Servicios</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={() => scrollToSection('profesionales')}
                                    className="text-xs font-medium py-2.5 px-3 rounded-lg cursor-pointer text-slate-200 focus:bg-blue-600/20 focus:text-white flex items-center gap-2.5"
                                >
                                    <Users className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span>Staff</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={() => scrollToSection('inspiracion')}
                                    className="text-xs font-medium py-2.5 px-3 rounded-lg cursor-pointer text-slate-200 focus:bg-blue-600/20 focus:text-white flex items-center gap-2.5"
                                >
                                    <ImageIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span>Inspiración</span>
                                </DropdownMenuItem>

                                {products && products.length > 0 && (
                                    <DropdownMenuItem
                                        onClick={() => scrollToSection('productos')}
                                        className="text-xs font-medium py-2.5 px-3 rounded-lg cursor-pointer text-slate-200 focus:bg-blue-600/20 focus:text-white flex items-center gap-2.5"
                                    >
                                        <ShoppingBag className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span>Tienda</span>
                                    </DropdownMenuItem>
                                )}

                                <DropdownMenuItem
                                    onClick={() => scrollToSection('beneficios')}
                                    className="text-xs font-semibold py-2.5 px-3 rounded-lg cursor-pointer text-[#C5A880] focus:bg-[#C5A880]/15 focus:text-[#f3e3ce] flex items-center gap-2.5"
                                >
                                    <Award className="h-4 w-4 text-[#C5A880] shrink-0" />
                                    <span>Pase Alfa</span>
                                </DropdownMenuItem>

                                {locales && locales.length > 0 && (
                                    <DropdownMenuItem
                                        onClick={() => scrollToSection('ubicacion')}
                                        className="text-xs font-medium py-2.5 px-3 rounded-lg cursor-pointer text-slate-200 focus:bg-blue-600/20 focus:text-white flex items-center gap-2.5"
                                    >
                                        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span>Ubicación</span>
                                    </DropdownMenuItem>
                                )}

                                <DropdownMenuSeparator className="bg-slate-800/80 my-1" />

                                {websiteSettings.showAppDownload !== false && (
                                    <DropdownMenuItem
                                        onClick={handleAppDownloadClick}
                                        className="text-xs font-semibold py-2.5 px-3 rounded-lg cursor-pointer text-blue-400 focus:bg-blue-600/20 focus:text-blue-300 flex items-center gap-2.5"
                                    >
                                        <Smartphone className="h-4 w-4 text-blue-400 shrink-0" />
                                        <span>Descargar App</span>
                                    </DropdownMenuItem>
                                )}

                                <DropdownMenuItem asChild>
                                    <Link
                                        href="/blog"
                                        prefetch={false}
                                        className="text-xs font-medium py-2.5 px-3 rounded-lg cursor-pointer text-slate-200 focus:bg-blue-600/20 focus:text-white flex items-center gap-2.5 w-full"
                                    >
                                        <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span>Blog</span>
                                    </Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            {/* Main Content Landmark */}
            <main className="flex-1">
                {/* Hero Institucional Vatos Alfa (Concepto 2: Malla Geométrica & Haces Láser - Viewport Completo 100vh) */}
                <section
                    ref={heroRef}
                    id="hero"
                    className="relative flex flex-col items-center justify-between pt-4 pb-6 sm:pb-8 md:pb-10 text-center px-4 overflow-hidden min-h-[calc(100svh-4rem)] sm:min-h-[calc(100vh-4rem)] z-10"
                >
                    <AlfaHeroBackground />

                    <motion.div 
                        style={{ 
                            y: heroContentY, 
                            opacity: heroContentOpacity, 
                            scale: heroContentScale,
                            transformStyle: 'preserve-3d',
                            backfaceVisibility: 'hidden',
                        }}
                        className="relative z-10 max-w-5xl mx-auto flex flex-col items-center justify-between w-full h-full flex-1 will-change-transform"
                    >
                        {/* 0. Enlaces Rápidos a Secciones (Visible en Desktop; en móvil se accede desde el botón de hamburguesa) */}
                        <div className="mb-auto pt-1 w-full hidden md:flex justify-center animate-in fade-in slide-in-from-top-2 duration-700">
                            <nav 
                                aria-label="Navegación rápida de secciones"
                                className="inline-flex items-center justify-center gap-4 sm:gap-6 md:gap-8 max-w-full overflow-x-auto scrollbar-none py-1 px-3"
                            >
                                <button
                                    onClick={() => scrollToSection('servicios')}
                                    className="text-[11px] sm:text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 py-0.5"
                                >
                                    Servicios
                                </button>

                                <button
                                    onClick={() => scrollToSection('profesionales')}
                                    className="text-[11px] sm:text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 py-0.5"
                                >
                                    Staff
                                </button>

                                <button
                                    onClick={() => scrollToSection('inspiracion')}
                                    className="text-[11px] sm:text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 py-0.5"
                                >
                                    Inspiración
                                </button>

                                {products && products.length > 0 && (
                                    <button
                                        onClick={() => scrollToSection('productos')}
                                        className="text-[11px] sm:text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 py-0.5"
                                    >
                                        Tienda
                                    </button>
                                )}

                                <button
                                    onClick={() => scrollToSection('beneficios')}
                                    className="text-[11px] sm:text-xs font-semibold text-[#C5A880] hover:text-[#f3e3ce] transition-colors cursor-pointer shrink-0 py-0.5"
                                >
                                    Pase Alfa
                                </button>

                                {websiteSettings.showAppDownload !== false && (
                                    <button
                                        onClick={handleAppDownloadClick}
                                        className="text-[11px] sm:text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer shrink-0 py-0.5 flex items-center gap-1.5"
                                    >
                                        <Smartphone className="h-3 w-3 shrink-0" />
                                        <span>Descargar App</span>
                                    </button>
                                )}

                                {locales && locales.length > 0 && (
                                    <button
                                        onClick={() => scrollToSection('ubicacion')}
                                        className="text-[11px] sm:text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 py-0.5"
                                    >
                                        Ubicación
                                    </button>
                                )}
                            </nav>
                        </div>

                        {/* Contenedor Central del Hero (Alineado verticalmente al centro) */}
                        <div className="my-auto py-6 sm:py-10 max-w-4xl flex flex-col items-center">
                            {/* 1. Pill Superior en Vivo (Horario y Estado Real de la Sucursal) */}
                            <div
                                className={cn(
                                    "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6 backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 duration-700",
                                    branchStatus.isOpen
                                        ? "bg-blue-500/10 border border-blue-500/30 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.25)]"
                                        : "bg-slate-900/80 border border-slate-700/80 text-slate-300 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                                )}
                            >
                                <span className="relative flex h-2 w-2">
                                    {branchStatus.isOpen ? (
                                        <>
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                        </>
                                    ) : (
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400/90 shadow-[0_0_6px_rgba(248,113,113,0.6)]"></span>
                                    )}
                                </span>
                                <span>{branchStatus.fullBadgeText}</span>
                            </div>

                            {/* 2. Titular con Acento de Luz (Azul Institucional Vatos Alfa Puro) */}
                            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white mb-6 leading-[1.1] animate-in slide-in-from-bottom-5 duration-700">
                                {sloganParts.first}{" "}
                                {sloganParts.second && (
                                    <span className="block sm:inline text-transparent bg-clip-text bg-gradient-to-r from-[#dbeafe] via-[#60a5fa] to-[#2563eb] drop-shadow-[0_0_35px_rgba(59,130,246,0.45)]">
                                        {sloganParts.second}
                                    </span>
                                )}
                            </h2>

                            {/* 3. Subtítulo Persuasivo */}
                            <p className="text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl leading-relaxed font-medium animate-in slide-in-from-bottom-5 duration-1000 delay-150">
                                {heroDescription}
                            </p>
                        </div>

                        {/* 4. Chips de Confianza / Prueba Social pegados cerca del borde inferior */}
                        <div className="mt-auto w-full max-w-3xl flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-5 border-t border-slate-800/80 text-xs sm:text-sm text-slate-300 animate-in fade-in duration-1000 delay-300">
                            <a
                                href={googleRatingData.googleMapsUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 font-semibold hover:text-white transition-colors"
                                title="Ver opiniones reales en Google Maps"
                            >
                                <span className="text-[#C5A880] tracking-widest text-sm">★★★★★</span>
                                <span className="text-white font-bold">{googleRatingData.rating.toFixed(1)}</span>
                                <span className="text-slate-400 text-xs">
                                    {googleRatingData.userRatingCount
                                        ? `(${googleRatingData.userRatingCount} opiniones en Google)`
                                        : '(Google Reviews)'}
                                </span>
                            </a>
                            <span className="hidden sm:inline text-slate-700">•</span>
                            <div className="flex items-center gap-1.5 font-medium text-slate-300">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <span>Cero Esperas: Citas Puntuales</span>
                            </div>
                            <span className="hidden sm:inline text-slate-700">•</span>
                            <div className="flex items-center gap-1.5 font-medium text-slate-300">
                                <Sparkles className="w-4 h-4 text-[#C5A880]" />
                                <span>10ª Visita Gratis (Pase Alfa)</span>
                            </div>
                        </div>
                    </motion.div>
                </section>

            {/* Professional Profile Dialog (Estilo App Móvil con Cabecera Oficial, Haz de Luz y Botón Alfa) */}
            <Dialog open={!!selectedPro} onOpenChange={(open) => !open && setSelectedPro(null)}>
                <DialogContent
                    hideCloseButton={true}
                    className="w-[calc(100%-2.5rem)] sm:w-full max-w-2xl bg-transparent border-none shadow-none p-0 overflow-visible flex flex-col justify-center items-center max-h-[90vh] z-50 gap-0"
                >

                    {/* Resplandor de Luz Dorada Mate (Puro destello de luz, sin marco perimetral) */}
                    <AlfaGoldSmokeBurst key={selectedPro?.id || 'pro-smoke'} />

                    {/* Contenedor Oficial del Modal */}
                    <div className="relative z-10 w-full bg-white rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border-2 border-blue-500 flex flex-col max-h-[90vh]">
                        {/* Cabecera Oficial VATOS ALFA con haz de luz */}
                        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 relative overflow-hidden shrink-0">
                            <div className="header-light-beam" aria-hidden="true" />
                            <div className="relative z-10 flex items-center justify-between w-full">
                                <div className="flex items-center gap-2.5">
                                    <User className="h-5 w-5 text-slate-300 shrink-0" />
                                    <div>
                                        <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                                            Biografía
                                        </DialogTitle>
                                        <DialogDescription className="sr-only">
                                            Biografía de {selectedPro?.publicName || selectedPro?.name}
                                        </DialogDescription>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedPro(null)}
                                    className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                    aria-label="Cerrar modal"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo del Modal */}
                        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-4 sm:gap-5">
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-center sm:items-start">
                                {/* Foto del Barbero */}
                                <div className="relative w-36 h-36 sm:w-52 sm:h-52 rounded-xl overflow-hidden bg-slate-900 border border-border/60 shrink-0 shadow-md flex items-center justify-center group mx-auto sm:mx-0">
                                    {selectedPro?.avatarUrl ? (
                                        <Image
                                            src={selectedPro.avatarUrl}
                                            alt={`${selectedPro.publicName || selectedPro.name || 'Barbero'} - Barbero Profesional en ${companyName} ${currentBranchName} Querétaro`}
                                            fill
                                            sizes="(max-width: 640px) 150px, 220px"
                                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                                            unoptimized={true}
                                        />
                                    ) : (
                                        <div className="h-full w-full bg-slate-800 flex items-center justify-center">
                                            <User className="h-16 w-16 text-slate-500" />
                                        </div>
                                    )}
                                </div>

                                {/* Información y Biografía */}
                                <div className="flex-1 flex flex-col justify-between w-full">
                                    <div className="space-y-2.5 sm:space-y-3">
                                        <div className="text-center sm:text-left">
                                            <h3 className="text-xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
                                                {selectedPro?.publicName || selectedPro?.name}
                                            </h3>
                                        </div>

                                        {/* Cita / Filosofía de corte */}
                                        <div className="relative p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 italic text-xs sm:text-sm leading-relaxed">
                                            <span className="text-xl sm:text-2xl font-serif text-slate-400 absolute -top-1 left-2 select-none">“</span>
                                            <p className="pl-3 sm:pl-3.5">
                                                {selectedPro?.biography || "Especialista en cortes limpios, fades de alta precisión y perfilado de barba con el tradicional ritual de toalla caliente en VATOS ALFA."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Botón de Acción Principal Oficial */}
                            <div className="pt-3 sm:pt-4 border-t border-border/60">
                                <Button
                                    variant="alfa"
                                    className="w-full h-11 sm:h-12 rounded-xl text-xs sm:text-base font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                                    onClick={() => {
                                        const proId = selectedPro.id;
                                        setSelectedPro(null);
                                        router.push(`/reservar?professionalId=${proId}`);
                                    }}
                                >
                                    <Calendar className="w-4 h-4 text-slate-300" />
                                    <span>Agendar Cita con {selectedPro?.publicName ? selectedPro.publicName.split(' ')[0] : (selectedPro?.name ? selectedPro.name.split(' ')[0] : 'Barbero')}</span>
                                    <ArrowRight className="w-4 h-4 text-slate-300" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Services */}



            {/* Context Paragraph Section for Local SEO & AEO (Discreto y compacto) */}
            <ScrollReveal distance={20}>
                <section id="descripcion" className="py-6 sm:py-8 bg-slate-50 border-b border-border/60 flex flex-col justify-center scroll-mt-20">
                    <div className="container max-w-3xl mx-auto px-4 text-center">
                        <h1 className="text-sm sm:text-base md:text-lg font-black tracking-wider uppercase text-[#202A49] dark:text-white mb-2">
                            Especialistas en Cortes y Barbas en Querétaro
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto font-medium">
                            {companyDescription}
                        </p>
                    </div>
                </section>
            </ScrollReveal>

            {/* Professionals Section */}
            {filteredProfessionals && filteredProfessionals.length > 0 && (
                <ScrollReveal className="w-full">
                    <section id="profesionales" className="min-h-[100svh] flex flex-col justify-center py-16 sm:py-20 md:py-24 bg-white scroll-mt-20">
                        <div className="container px-4 md:px-6 my-auto">
                            {activePromotions.length > 0 && (
                                <div className="flex justify-center mb-10">
                                    <Link 
                                        href="#beneficios" 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            document.getElementById('beneficios')?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        className="group relative inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-950 text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] border border-blue-500/30 overflow-hidden shadow-md"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-blue-600 to-[#2563eb] opacity-20 group-hover:opacity-40 transition-opacity duration-300" />
                                        
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                        </span>
                                        
                                        <span className="relative z-10 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                                            ¡Tenemos Promociones Activas! Ver ofertas
                                        </span>
                                        
                                        <ArrowRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </div>
                            )}

                            <div className="text-center mb-6 sm:mb-8">
                                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground uppercase">
                                    STAFF
                                </h2>
                            </div>

                            <Team360Gallery
                                barbers={filteredProfessionals}
                                onSelectBarber={(pro) => setSelectedPro(pro)}
                                onBookBarber={(pro) => router.push(`/reservar?professionalId=${pro.id}`)}
                                branchName={currentBranchName}
                                companyName={companyName}
                            />
                        </div>
                    </section>
                </ScrollReveal>
            )}

            {/* 2. Unified Services and Packages Section (Estilo App Móvil) */}
            <ScrollReveal>
                <AlfaServicesSection
                    regularServices={regularServices}
                    packageServices={packageServices}
                    onSelectService={(service) => setSelectedService(service)}
                    onAddToCart={(serviceId) => {
                        if (cart.includes(serviceId)) {
                            removeFromCart(serviceId);
                        } else {
                            addToCart(serviceId);
                        }
                    }}
                    cartServiceIds={cart}
                    formatPrice={formatPrice}
                    getPackageDescription={getPackageDescription}
                />
            </ScrollReveal>

            {/* 3. Inspiración Alfa: Carrusel 3D Cilíndrico de Cortes Reales (Estilo App Móvil) */}
            <ScrollReveal className="w-full">
                <section id="inspiracion" className="min-h-[100svh] flex flex-col justify-center bg-[#0b101e] border-y border-slate-800 scroll-mt-20">
                    <Alfa3DCarousel
                        stylesList={cortesReales.length > 0 ? cortesReales : undefined}
                        onBookStyle={(style) => {
                            router.push('/reservar' + (style.serviceMatchId ? `?serviceId=${style.serviceMatchId}` : ''));
                        }}
                    />
                </section>
            </ScrollReveal>

            {/* Products Section (Estilo App Móvil: Tarjetas Cuadradas, 2 Columnas Móvil) */}
            {
                products && products.length > 0 && (
                    <ScrollReveal>
                        <AlfaProductsSection
                            products={products}
                            onSelectProduct={(product) => setSelectedProduct(product)}
                            onAddToCart={(productId) => addToProductCart(productId)}
                            productCart={productCart}
                            getProductCount={getProductCount}
                            formatPrice={formatPrice}
                        />
                    </ScrollReveal>
                )
            }

            {/* 4. Beneficios Exclusivos y Pase Alfa Club (Estilo App Móvil) */}
            <AlfaBenefitsSection
                promotions={activePromotions}
                paseAlfaData={paseAlfaConfig}
                onBookBenefit={(_benefit) => {
                    router.push('/reservar');
                }}
                onDownloadApp={handleAppDownloadClick}
            />

            {/* Service Details Modal (Estilo App Móvil con Cabecera Oficial y Botón de Agendar) */}
            <Dialog open={!!selectedService} onOpenChange={(open) => !open && setSelectedService(null)}>
                <DialogContent
                    hideCloseButton={true}
                    className="w-[calc(100%-2.5rem)] sm:w-full max-w-2xl bg-transparent border-none shadow-none p-0 overflow-visible flex flex-col justify-center items-center max-h-[90vh] z-50 gap-0"
                >

                    {/* Resplandor de Luz Dorada Mate (Puro destello de luz, sin marco perimetral) */}
                    <AlfaGoldSmokeBurst key={selectedService?.id || 'smoke'} />

                    {/* Contenedor Oficial del Modal */}
                    <div className="relative z-10 w-full bg-white rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border-2 border-blue-500 flex flex-col max-h-[90vh]">
                        {/* Cabecera Oficial VATOS ALFA con haz de luz */}
                    <div className="p-4 sm:p-5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 relative overflow-hidden shrink-0">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-2.5">
                                <Scissors className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                                        {selectedService?.name}
                                    </DialogTitle>
                                    <DialogDescription className="sr-only">
                                        Detalles del servicio {selectedService?.name}
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedService(null)}
                                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                aria-label="Cerrar modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Cuerpo del Modal */}
                    <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
                        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                            {/* Imagen del Servicio */}
                            <div className="relative w-full sm:w-52 aspect-video sm:aspect-square rounded-xl overflow-hidden bg-slate-900 border border-border/60 shrink-0 shadow-sm">
                                {(() => {
                                    const modalImg = selectedService ? getServiceLocalImage(selectedService.name, selectedService.images) : null;
                                    return modalImg ? (
                                        <Image
                                            src={modalImg}
                                            alt={selectedService?.name || 'Servicio'}
                                            fill
                                            className="object-cover"
                                            unoptimized={true}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                                            <Scissors className="h-12 w-12 text-slate-400" />
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Info: Precio, Duración, Anticipo y Descripción */}
                            <div className="flex-1 w-full flex flex-col justify-between">
                                <div>
                                    <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-border/60">
                                        <span className="text-2xl sm:text-3xl font-bold text-foreground font-sans">
                                            {selectedService ? formatPrice(selectedService.price) : ''}
                                        </span>
                                        <div className="flex items-center text-muted-foreground gap-1.5 text-sm font-medium font-sans">
                                            <Clock className="h-4 w-4 text-slate-400" />
                                            <span>{selectedService?.duration || selectedService?.duracion || 40} min</span>
                                        </div>
                                    </div>

                                    {selectedService?.payment_type === 'online-deposit' && (
                                        <div className="mb-4">
                                            <span className="text-xs text-[#C5A880] font-semibold bg-[#C5A880]/10 px-3 py-1.5 rounded-lg border border-[#C5A880]/30 flex items-center w-full justify-center gap-2">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A880] opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C5A880]"></span>
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

                                    <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                        <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1.5">
                                            Descripción del servicio
                                        </h4>
                                        {selectedService?.description || (selectedService?.name ? getPackageDescription(selectedService.name) : null) ? (
                                            <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">
                                                {selectedService.description || getPackageDescription(selectedService.name)}
                                            </p>
                                        ) : (
                                            <p className="italic text-slate-400">Sin descripción detallada disponible.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Botones de Acción: Agendar y Agregar */}
                        <div className="pt-4 border-t border-border/60 flex flex-col gap-2.5">
                            <Button
                                variant="alfa"
                                className="w-full h-12 rounded-xl text-sm sm:text-base font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                                onClick={() => {
                                    const svcId = selectedService.id;
                                    setSelectedService(null);
                                    router.push(`/reservar?serviceId=${svcId}`);
                                }}
                            >
                                <Calendar className="w-4 h-4 text-slate-300" />
                                <span>Agendar este Servicio</span>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                            </Button>

                            <Button
                                variant="outline"
                                className="w-full h-10 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-foreground flex items-center justify-center gap-1.5 cursor-pointer"
                                onClick={() => {
                                    addToCart(selectedService.id);
                                    setSelectedService(null);
                                }}
                            >
                                <Plus className="w-4 h-4 text-slate-400" />
                                <span>Agregar al Pedido y Seguir</span>
                            </Button>
                        </div>
                    </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Product Details Modal (Estilo App Móvil con Cabecera Oficial, Haz de Luz y Bomba de Humo Dorado Mate) */}
            <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
                <DialogContent
                    hideCloseButton={true}
                    className="w-[calc(100%-1.75rem)] sm:w-full max-w-2xl bg-transparent border-none shadow-none p-0 overflow-visible flex flex-col justify-center items-center max-h-[90vh] z-50 gap-0"
                >

                    {/* Resplandor de Luz Dorada Mate (Puro destello de luz, sin marco perimetral) */}
                    <AlfaGoldSmokeBurst key={selectedProduct?.id || 'product-smoke'} />

                    {/* Contenedor Oficial del Modal */}
                    <div className="relative z-10 w-full bg-white rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border-2 border-blue-500 flex flex-col max-h-[90vh]">
                        {/* Cabecera Oficial VATOS ALFA con haz de luz */}
                        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 relative overflow-hidden shrink-0">
                            <div className="header-light-beam" aria-hidden="true" />
                            <div className="relative z-10 flex items-center justify-between w-full">
                                <div className="flex items-center gap-2.5">
                                    <ShoppingBag className="h-5 w-5 text-slate-300 shrink-0" />
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                                        {selectedProduct?.nombre}
                                    </DialogTitle>
                                    <DialogDescription className="sr-only">
                                        Detalle del producto
                                    </DialogDescription>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedProduct(null)}
                                    className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                    aria-label="Cerrar modal"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo del Modal */}
                        <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
                            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                                {/* Imagen del Producto */}
                                <div className="relative w-full sm:w-52 aspect-square rounded-xl overflow-hidden bg-slate-900 border border-border/60 shrink-0 shadow-sm flex items-center justify-center">
                                    {selectedProduct?.images && selectedProduct.images.length > 0 ? (
                                        <Image
                                            src={selectedProduct.images[0]}
                                            alt={selectedProduct?.nombre || 'Producto'}
                                            fill
                                            className="object-cover"
                                            unoptimized={true}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                                            <ShoppingBag className="h-12 w-12 text-slate-400" />
                                        </div>
                                    )}
                                </div>

                                {/* Info: Precio, Stock, Anticipo y Descripción */}
                                <div className="flex-1 w-full flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-border/60">
                                            <span className="text-2xl sm:text-3xl font-bold text-foreground font-sans">
                                                {selectedProduct ? formatPrice(selectedProduct.public_price) : ''}
                                            </span>
                                            {selectedProduct?.stock !== undefined && (
                                                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                                    {selectedProduct.stock > 0 ? 'En existencia' : 'Consultar stock'}
                                                </span>
                                            )}
                                        </div>

                                        {selectedProduct?.payment_type === 'deposit' && (
                                            <div className="mb-4">
                                                <span className="text-xs text-[#C5A880] font-semibold bg-[#C5A880]/10 px-3 py-1.5 rounded-lg border border-[#C5A880]/30 flex items-center w-full justify-center gap-2">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A880] opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C5A880]"></span>
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

                                        <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1.5">
                                                Descripción del producto
                                            </h4>
                                            {selectedProduct?.description ? (
                                                <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">
                                                    {selectedProduct.description}
                                                </p>
                                            ) : (
                                                <p className="italic text-slate-400">Sin descripción detallada disponible.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Botón de Acción Principal: Agregar al Pedido */}
                            <div className="pt-4 border-t border-border/60">
                                <Button
                                    variant="alfa"
                                    className="w-full h-12 rounded-xl text-sm sm:text-base font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                                    onClick={() => {
                                        addToProductCart(selectedProduct.id);
                                        setSelectedProduct(null);
                                        toast({
                                            title: "Producto agregado",
                                            description: `${selectedProduct.nombre} se agregó a tu pedido.`,
                                        });
                                    }}
                                >
                                    <ShoppingBag className="w-4 h-4 text-slate-300" />
                                    <span>Agregar al Pedido</span>
                                    <Plus className="w-4 h-4 text-slate-300" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Promotion Reel Modal - CLEAN VIDEO ONLY */}
            <Dialog open={!!selectedPromotion} onOpenChange={(open) => !open && setSelectedPromotion(null)}>
                <DialogContent className="max-w-none w-full h-[100dvh] sm:w-[400px] sm:h-[800px] sm:max-h-[90vh] bg-black p-0 rounded-none sm:rounded-[2rem] overflow-hidden border-none sm:border sm:border-white/20 shadow-2xl flex flex-col">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{selectedPromotion?.name || 'Ver Promoción'}</DialogTitle>
                        <DialogDescription>{selectedPromotion?.description || 'Detalle de la promoción'}</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 w-full h-full bg-black relative flex items-center justify-center">
                        {selectedPromotion?.imageUrl ? (
                            <PromoMedia
                                url={selectedPromotion.imageUrl}
                                name={selectedPromotion?.name || 'Promoción'}
                                cover={false}
                                muted={false}
                                controls={true}
                            />
                        ) : (
                            <div className="text-white/50 text-center p-8">
                                <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p>Sin contenido visual</p>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => setSelectedPromotion(null)}
                        className="absolute top-4 right-4 bg-black/40 backdrop-blur-lg border border-white/20 text-white p-2.5 rounded-full hover:bg-white/20 transition-colors z-50 shadow-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </DialogContent>
            </Dialog>

            {/* Terms and Conditions Modal */}
            <Dialog open={!!showTerms} onOpenChange={(open) => !open && setShowTerms(null)}>
                <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Info className="w-5 h-5 text-primary" /> Términos y Condiciones
                        </DialogTitle>
                        <DialogDescription>
                            {showTerms?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                        {showTerms?.termsAndConditions}
                    </div>
                    <div className="mt-6 flex gap-3">
                        <Button 
                            variant="outline" 
                            className="flex-1" 
                            onClick={() => {
                                const url = `${window.location.origin}/promociones/${showTerms?.id}/terminos`;
                                navigator.clipboard.writeText(url);
                                toast({
                                    title: "Link de términos copiado",
                                    description: "El enlace público de los términos y condiciones se ha copiado al portapapeles.",
                                });
                            }}
                        >
                            <Share2 className="w-4 h-4 mr-2" /> Copiar Link
                        </Button>
                        <VatosButton className="flex-1" onClick={() => setShowTerms(null)}>
                            Entendido
                        </VatosButton>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Barra Flotante de Reserva Inferior (Sticky Bottom CTA Bar) */}
            <AlfaFloatingBottomBar
                totalItems={totalItems}
                totalPrice={totalPrice}
                formatPrice={formatPrice}
                isBooking={isBooking}
                hasServiceInCart={cart.length > 0}
                onBookingClick={() => {
                    if (selectedBranch && selectedBranch !== 'coming-soon') {
                        router.push(`/reservar?branchId=${selectedBranch}`);
                    } else {
                        router.push('/reservar');
                    }
                }}
                onConfirmCartClick={handleBooking}
                onOpenJanetChat={() => setIsJanetChatOpen(true)}
                branchName={currentBranchName}
                branchAddress={currentBranchObj?.address || 'Av. Sombrerete 1001, Col. Cipreses, Querétaro'}
                companyName={companyName}
            />

            {/* Modal de Chat Interactivo con Janet / Recepción */}
            <JanetChatModal
                isOpen={isJanetChatOpen}
                onOpenChange={setIsJanetChatOpen}
                branchName={currentBranchName}
                branchAddress={currentBranchObj?.address || 'Av. Sombrerete 1001, Col. Cipreses, Querétaro'}
                onNavigateToBooking={() => {
                    if (selectedBranch && selectedBranch !== 'coming-soon') {
                        router.push(`/reservar?branchId=${selectedBranch}`);
                    } else {
                        router.push('/reservar');
                    }
                }}
            />

            {/* Locations / Branches Section */}
            {
                locales && locales.length > 0 && (
                    <ScrollReveal>
                        <section id="ubicacion" className="py-16 bg-slate-50 border-t scroll-mt-20">
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
                                                    {local.name === 'VATOS ALFA Barber Shop Suc1' || local.name?.includes('Suc1') ? 'VATOS ALFA Barber Shop - Sucursal Sombrerete' : local.name}
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
                                                            className="flex items-center gap-1.5 hover:text-blue-400 hover:underline transition-colors"
                                                        >
                                                            <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400 fill-current" fill="currentColor" role="img" xmlns="http://www.w3.org/2000/svg"><title>WhatsApp</title><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1-5.106c0-5.445 4.406-9.885 9.885-9.885 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.444-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
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
                                            <CardFooter className="flex flex-col gap-2">
                                                <VatosButton variant="outline" className="w-full" asChild>
                                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${companyName} ${local.address}`)}`} target="_blank" rel="noopener noreferrer">
                                                        Ver en Mapa
                                                    </a>
                                                </VatosButton>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setIsJanetChatOpen(true)}
                                                    className="w-full text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 font-semibold"
                                                >
                                                    <Bot className="h-4 w-4 text-blue-600" />
                                                    <span>Chatear con Recepción / Janet</span>
                                                </Button>
                                            </CardFooter>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </ScrollReveal>
                )
            }
            </main>

            {/* Footer */}
            <footer id="footer" className="py-12 border-t border-slate-200 bg-slate-50 text-center text-sm text-slate-700 scroll-mt-20">
                <div className="container px-4 flex flex-col items-center gap-4 text-slate-700">
                    <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>

                    {websiteSettings.privacyPolicyEnabled !== false && (
                        <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-700">
                            <Link
                                href="/blog"
                                prefetch={false}
                                className="hover:underline hover:text-primary transition-colors text-slate-700 font-semibold"
                            >
                                Blog
                            </Link>
                            <Link
                                href="/privacidad"
                                prefetch={false}
                                className="hover:underline hover:text-primary transition-colors text-slate-700 font-semibold"
                            >
                                Aviso de Privacidad
                            </Link>
                            <Link
                                href="/terminos"
                                prefetch={false}
                                className="hover:underline hover:text-primary transition-colors text-slate-700 font-semibold"
                            >
                                Términos y Condiciones
                            </Link>
                        </div>
                    )}

                    {/* Modals for Landing Page */}
                    <Dialog open={privacyModalOpen} onOpenChange={setPrivacyModalOpen}>
                        <DialogContent className="max-w-md sm:max-w-2xl lg:max-w-3xl bg-white p-6 rounded-2xl max-h-[85vh] flex flex-col shadow-2xl">
                            <DialogHeader className="border-b pb-3">
                                <DialogTitle className="text-xl font-bold text-foreground">Aviso de Privacidad Integral</DialogTitle>
                            </DialogHeader>
                            <div className="flex-1 overflow-y-auto mt-4 pr-3 text-slate-700 leading-relaxed">
                                <div className="text-xs sm:text-sm whitespace-pre-line">
                                    {websiteSettings.privacyText || 'Sin contenido de privacidad.'}
                                </div>
                            </div>
                            <DialogFooter className="mt-4 pt-3 border-t flex flex-row items-center justify-between">
                                <a
                                    href="/privacidad"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                                >
                                    Ver en página completa <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                                <VatosButton onClick={() => setPrivacyModalOpen(false)}>Entendido</VatosButton>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
                        <DialogContent className="max-w-md sm:max-w-2xl lg:max-w-3xl bg-white p-6 rounded-2xl max-h-[85vh] flex flex-col shadow-2xl">
                            <DialogHeader className="border-b pb-3">
                                <DialogTitle className="text-xl font-bold text-foreground">Términos y Condiciones de Servicio</DialogTitle>
                            </DialogHeader>
                            <div className="flex-1 overflow-y-auto mt-4 pr-3 text-slate-700 leading-relaxed">
                                <div className="text-xs sm:text-sm whitespace-pre-line">
                                    {websiteSettings.termsText || 'Sin términos y condiciones definidos.'}
                                </div>
                            </div>
                            <DialogFooter className="mt-4 pt-3 border-t flex flex-row items-center justify-between">
                                <a
                                    href="/terminos"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                                >
                                    Ver en página completa <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                                <VatosButton onClick={() => setTermsModalOpen(false)}>Aceptar y Cerrar</VatosButton>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Link href="/login" prefetch={false} className="mt-2 inline-block text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline transition-colors">Acceso Staff</Link>
                </div>
            </footer>

            {/* Floating Navigation Menu */}
            <FloatingMenu totalItems={totalItems} hasActivePromotions={activePromotions && activePromotions.length > 0} />

            {/* Navegación Vertical Rápida (Bare icons subir al inicio / bajar por secciones) */}
            <VerticalSectionNavigator />

            {/* Modal Oficial de Descarga de App Móvil */}
            <AppDownloadModal
                isOpen={isAppDownloadOpen}
                onOpenChange={setIsAppDownloadOpen}
                playStoreUrl={effectivePlayStoreUrl}
                appStoreUrl={effectiveAppStoreUrl}
            />

        </div>
        </ParallaxHero>
    );
}
