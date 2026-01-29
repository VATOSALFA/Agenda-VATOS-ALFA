'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { CustomLoader } from '@/components/ui/custom-loader';
import { format, isBefore, startOfToday, parse, set, addMinutes, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, ChevronLeft, ChevronRight, Clock, User, Scissors, Users, Trash2, Plus, Minus, CalendarDays, Layers, UserCheck, Edit2, ShoppingBag, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createPublicReservation, getAvailableSlots } from '@/lib/actions/booking';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';


// Helper Interfaces
interface CartItem {
    uniqueId: string;
    serviceId: string;
    service: any;
}

interface AppointmentConfig {
    date: Date;
    time: string;
    professional: any;
    professionalId?: string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);
const formatPrice = (price: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(price || 0));
const correctName = (name: string) => name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');

export default function BookingPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast: shadToast } = useToast();
    const toast = Object.assign(
        (props: any) => shadToast(props),
        {
            success: (msg: string) => shadToast({ description: msg, className: "bg-green-500 text-white border-green-600" }),
            error: (msg: string) => shadToast({ variant: "destructive", description: msg }),
        }
    );
    const executeRecaptcha = async (action?: string) => "mock-token";

    // Data Queries
    const { data: services = [], loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: productsData = [], loading: loadingProducts } = useFirestoreQuery<any>('productos');
    const { data: rawProfessionals = [], loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const professionals = useMemo(() => rawProfessionals.filter((p: any) => !p.deleted), [rawProfessionals]);
    const { data: settingsDocs = [], loading: loadingSettings } = useFirestoreQuery<any>('settings');
    const websiteSettings: any = settingsDocs.find((d: any) => d.id === 'website') || {};
    const { data: empresaData = [] } = useFirestoreQuery<any>('empresa');
    const { data: locales = [] } = useFirestoreQuery<any>('locales');
    const { data: categories = [] } = useFirestoreQuery<any>('categorias_servicios');



    // Core State
    const [cart, setCart] = useState<CartItem[]>([]);
    const [productCart, setProductCart] = useState<any[]>([]);
    const [step, setStep] = useState(0);
    const [bookingMode, setBookingMode] = useState<'individual' | 'combined'>('individual');

    // Booking Logic State
    const [configs, setConfigs] = useState<{ [key: string]: AppointmentConfig }>({});
    const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
    const [preSelectedProId, setPreSelectedProId] = useState<string | null>(null);

    // Temp Selection State
    const [tempDate, setTempDate] = useState<Date | undefined>(undefined);
    const [tempTime, setTempTime] = useState<string>('');
    const [tempAvailableSlots, setTempAvailableSlots] = useState<string[]>([]);
    const [tempSlotMap, setTempSlotMap] = useState<{ [key: string]: string[] }>({});
    const [configStep, setConfigStep] = useState(1);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [noCapablePros, setNoCapablePros] = useState(false);
    const [clientDetails, setClientDetails] = useState({
        name: '',
        lastName: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
        birthday: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- INITIALIZATION ---
    useEffect(() => {
        if (cart.length > 0 || services.length === 0) return;

        const servicesParam = searchParams.get('services');
        const productsParam = searchParams.get('products'); // Read products from URL
        const legacyServiceId = searchParams.get('serviceId');
        const proIdParam = searchParams.get('professionalId');

        if (proIdParam) setPreSelectedProId(proIdParam);

        // Priority 1: List of services (from Landing Page Cart)
        if (servicesParam) {
            const ids = servicesParam.split(',');
            const newCart: CartItem[] = [];
            ids.forEach(id => {
                const svc = services.find(s => s.id === id);
                if (svc) newCart.push({ uniqueId: generateId(), serviceId: svc.id, service: svc });
            });
            if (newCart.length > 0) setCart(newCart);
        }

        // Handle Products Param
        if (productsParam) {
            const pIds = productsParam.split(',');
            const newPCart: any[] = [];
            // We need to fetch products or assume we have them if we had a global 'products' list. 
            // Since we don't have a 'products' list loaded here yet, we might need to fetch them or pass full data (encoded). 
            // For simplicity, let's assume we can fetch them or they are in 'services' if mixed, 
            // BUT actually products are usually separate. 
            // If products are hardcoded in landing page, we can't 'find' them here unless we fetch them from FS or hardcode them here too.
            // WAIT: The user request implies products ARE in the system. 
            // Let's assume we need to load products. 
            // *Correction*: The user code I saw earlier in 'page.tsx' had hardcoded products or fetched them?
            // Let's check 'page.tsx' imports. It sees 'useFirestoreQuery("productos")'.
            // I need to add that query here.
        }

        // Priority 2: Single Service (Legacy Deep Link)
        if (legacyServiceId) {
            const legacySvc = services.find(s => s.id === legacyServiceId);
            if (legacySvc) {
                setCart([{ uniqueId: generateId(), serviceId: legacySvc.id, service: legacySvc }]);
            }
        }
    }, [searchParams, services]);

    // FETCH PRODUCTS (Added query)


    // Initialize Product Cart when productsData is ready
    useEffect(() => {
        const productsParam = searchParams.get('products');
        if (productsParam && productsData.length > 0) {
            const pIds = productsParam.split(',');
            const newPCart: any[] = [];
            pIds.forEach(id => {
                const prod = productsData.find((p: any) => p.id === id);
                if (prod) newPCart.push(prod);
            });
            setProductCart(newPCart);
        }
    }, [searchParams, productsData]);


    // AUTO-SKIP LOGIC FOR CART (Combined Services + Products OR Only Products)
    // AUTO-SKIP LOGIC FOR CART (Combined Services + Products OR Only Products)
    // ONLY runs if we are processing the INITIAL URL parameters (not manual adds)
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);

    useEffect(() => {
        // Wait for data to load
        if (loadingServices) return;
        if (initialLoadComplete) return; // Prevent re-running on manual cart updates

        const servicesParam = searchParams.get('services');
        const legacyServiceId = searchParams.get('serviceId');

        // If we have URL params, we might want to auto-navigate
        if (servicesParam || legacyServiceId) {
            const hasServices = cart.length > 0;
            if (hasServices && step === 0) {
                const proIdParam = searchParams.get('professionalId');
                if (proIdParam) {
                    setBookingMode('combined');
                    setActiveConfigId('combined');
                    setTempDate(undefined);
                    setConfigStep(0);
                    setStep(2);
                } else if (cart.length > 1) {
                    setStep(1);
                } else {
                    setBookingMode('combined');
                    setActiveConfigId('combined');
                    setTempDate(undefined);
                    setConfigStep(0);
                    setStep(2);
                }
            }
        }

        // Mark initial load as done after first pass (whether we moved or not)
        setInitialLoadComplete(true);

    }, [cart, loadingServices, searchParams, step, initialLoadComplete]);

    // --- COMPUTED ---
    const activeServiceIds = useMemo(() => cart.map(c => c.serviceId), [cart]);
    const { totalPrice, upfrontTotal } = useMemo(() => {
        const total = cart.reduce((acc, item) => acc + Number(item.service.price || 0), 0);
        const upfront = cart.reduce((sum, item) => {
            const pType = item.service.payment_type || 'no-payment';
            if (pType === 'online-deposit') {
                const amountType = item.service.payment_amount_type || '%';
                const amountValue = Number(item.service.payment_amount_value);

                if (amountType === '$' && amountValue > 0) {
                    return sum + amountValue;
                } else if (amountType === '%' && amountValue > 0) {
                    return sum + (Number(item.service.price || 0) * (amountValue / 100));
                } else {
                    // Default fallback 50%
                    return sum + (Number(item.service.price || 0) * 0.5);
                }
            }
            if (pType === 'full-payment') return sum + Number(item.service.price || 0);
            return sum;
        }, 0);

        // Calculate Product Totals with Deposit Logic
        const productTotal = productCart.reduce((sum, p) => sum + Number(p.public_price || 0), 0);

        const productUpfront = productCart.reduce((sum, p) => {
            const price = Number(p.public_price || 0);
            const pType = p.payment_type || 'full'; // Default to full for products normally

            // Check for 'deposit' type used in NewProductModal
            if (pType === 'deposit') {
                const amountType = p.payment_amount_type || '%';
                const amountValue = Number(p.payment_amount_value || 0);

                if (amountType === '$' && amountValue > 0) {
                    return sum + amountValue;
                } else if (amountType === '%' && amountValue > 0) {
                    return sum + (price * (amountValue / 100));
                } else {
                    return sum + (price * 0.5); // Fallback 50%
                }
            }

            // If full payment (or default for products traditionally)
            return sum + price;
        }, 0);

        return {
            totalPrice: total + productTotal,
            upfrontTotal: upfront + productUpfront
        };
    }, [cart, productCart]);
    const totalDuration = useMemo(() => cart.reduce((acc, item) => acc + Number(item.service.duration || 0), 0), [cart]);

    // --- SORTED SERVICES ---
    const { visibleRegularServices, visiblePackageServices } = useMemo(() => {
        let available = services.filter((s: any) => s.active && !s.deleted);

        if (preSelectedProId) {
            available = available.filter((s: any) => {
                const pro = professionals.find(p => p.id === preSelectedProId);
                return pro && pro.services ? pro.services.includes(s.id) : false;
            });
        }

        // Sort by Order
        available.sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));

        // Identify Package Categories
        const packageCategoryIds = categories
            .filter((c: any) => c.name.toLowerCase().includes('paquete') || c.name.toLowerCase().includes('package'))
            .map((c: any) => c.id);

        const regular = available.filter((s: any) => !packageCategoryIds.includes(s.category));
        const pkgs = available.filter((s: any) => packageCategoryIds.includes(s.category));

        return { visibleRegularServices: regular, visiblePackageServices: pkgs };
    }, [services, professionals, categories, preSelectedProId]);

    // --- CART ACTIONS ---
    const addToCart = (service: any) => {
        setCart(prev => [...prev, { uniqueId: generateId(), serviceId: service.id, service }]);
    };

    const removeFromCart = (serviceId: string) => {
        setCart(prev => {
            const idx = prev.findIndex(item => item.serviceId === serviceId);
            if (idx === -1) return prev;
            const newCart = [...prev];
            newCart.splice(idx, 1);
            return newCart;
        });
    };

    const getCount = (serviceId: string) => cart.filter(x => x.serviceId === serviceId).length;

    // --- PRODUCT CART ACTIONS ---
    const addToProductCart = (product: any) => {
        setProductCart(prev => [...prev, product]);
    };

    const removeFromProductCart = (productId: string) => {
        setProductCart(prev => {
            const idx = prev.findIndex(p => p.id === productId);
            if (idx === -1) return prev;
            const newC = [...prev];
            newC.splice(idx, 1);
            return newC;
        });
    };

    const getProductCount = (productId: string) => productCart.filter(p => p.id === productId).length;

    // --- FLOW ACTIONS ---
    const handleServicesConfirmed = () => {
        if (cart.length === 0) return;

        // Manual confirmation always goes to next relevant step
        // If Pro is pre-selected, we skip mode selection and go to Config
        if (preSelectedProId) {
            setBookingMode('combined');
            setActiveConfigId('combined'); // Critical for Step 2 rendering
            setStep(2); // Direct to Date/Time
            setConfigStep(0);
            return;
        }

        // Standard flow
        if (cart.length > 1) {
            setStep(1); // Mode Select
        } else {
            setBookingMode('combined');
            startConfiguration('combined');
        }
    };

    const handleModeSelection = (mode: 'individual' | 'combined') => {
        setBookingMode(mode);
        setConfigs({});
        if (mode === 'combined') {
            startConfiguration('combined');
        } else {
            setStep(2); // Go to Dashboard
        }
    };

    // Start configuring a specific item (or the combined bundle)
    const startConfiguration = (id: string) => {
        setActiveConfigId(id);
        // Reset sub-flow
        setTempDate(undefined);
        setTempTime('');
        setTempAvailableSlots([]);
        setTempSlotMap({});
        setConfigStep(0); // Start at Date
        setStep(2); // Ensure we are in config view
    };

    // --- SCHEDULING LOGIC ---

    // Fetch slots based on selected date
    useEffect(() => {
        if (activeConfigId && tempDate) {
            const fetchSlots = async () => {
                setLoadingSlots(true);
                setTempAvailableSlots([]);
                setTempSlotMap({});

                const dateStr = format(tempDate, 'yyyy-MM-dd');

                // Determine duration
                let duration = 0;
                let requiredServiceIds: string[] = [];

                if (activeConfigId === 'combined') {
                    duration = totalDuration;
                    requiredServiceIds = activeServiceIds;
                } else {
                    const item = cart.find(c => c.uniqueId === activeConfigId);
                    if (item) {
                        duration = item.service.duration;
                        requiredServiceIds = [item.serviceId];
                    }
                }

                if (duration === 0) { setLoadingSlots(false); return; }

                // Filter Pros who can do THESE services
                const capablePros = professionals.filter(p =>
                    p.active &&
                    (!preSelectedProId || p.id === preSelectedProId) &&
                    requiredServiceIds.every(sId => (p.services || []).includes(sId))
                );

                if (capablePros.length === 0) {
                    setNoCapablePros(true);
                    setLoadingSlots(false);
                    return;
                } else {
                    setNoCapablePros(false);
                }

                // Fetch availability for all capable pros safely
                const promises = capablePros.map((p: any) =>
                    getAvailableSlots({ date: dateStr, professionalId: p.id, durationMinutes: duration || 30 })
                        .catch(err => {
                            console.error(`Error fetching slots for pro ${p.name}:`, err);
                            return { error: err.message || 'Unknown network error' };
                        })
                );

                try {
                    const results = await Promise.all(promises);
                    const newMap: Record<string, string[]> = {};
                    let errorFound: string | null = null;

                    results.forEach((res: any, index) => {
                        if (res.error) {
                            console.error(`Server error for pro ${capablePros[index].name}:`, res.error);
                            if (!errorFound) errorFound = res.error;
                        }
                        if (res && res.slots && Array.isArray(res.slots)) {
                            res.slots.forEach((time: string) => {
                                if (!newMap[time]) newMap[time] = [];
                                newMap[time].push(capablePros[index].id);
                            });
                        }
                    });

                    const availableTimes = Object.keys(newMap).sort();
                    setTempAvailableSlots(availableTimes);
                    setTempSlotMap(newMap);

                    if (availableTimes.length === 0 && errorFound) {
                        toast({ variant: 'destructive', title: 'Error de Disponibilidad', description: errorFound });
                    }
                } catch (e) {
                    console.error("Critical error fetching slots:", e);
                    toast({ variant: 'destructive', title: 'Error', description: 'Error al cargar horarios disponibles.' });
                } finally {
                    setLoadingSlots(false);
                }
            };

            fetchSlots();
        }
    }, [tempDate, activeConfigId]);

    const handleTimeSelected = (time: string) => {
        setTempTime(time);
        if (preSelectedProId) {
            handleProSelected(preSelectedProId, time);
        } else {
            setConfigStep(2); // Go to Pro selection
        }
    };

    const handleProSelected = (proId: string, overrideTime?: string) => {
        const timeToUse = overrideTime || tempTime;
        if (!activeConfigId || !tempDate || !timeToUse) return;

        const pro = professionals.find(p => p.id === proId);
        const config: AppointmentConfig = {
            date: tempDate,
            time: timeToUse,
            professionalId: proId,
            professional: pro
        };

        setConfigs(prev => ({ ...prev, [activeConfigId]: config }));
        setActiveConfigId(null); // Exit sub-flow

        if (bookingMode === 'combined') {
            setStep(3); // Go directly to details
        }
        // If separate, we stay on Step 2 (Dashboard) to configure others
    };

    const isDashboardComplete = useMemo(() => {
        if (bookingMode === 'combined') return !!configs['combined'];
        return cart.every(item => !!configs[item.uniqueId]);
    }, [cart, configs, bookingMode]);




    const confirmBooking = async () => {
        setIsSubmitting(true);
        const createdReservationIds: string[] = [];
        let errorCount = 0;

        try {
            if (!executeRecaptcha) {
                console.warn('Recaptcha not ready');
            }

            let token: string | null = null;
            try {
                if (executeRecaptcha) {
                    token = await executeRecaptcha('booking');
                }
            } catch (recaptchaError) {
                console.error("Recaptcha execution failed, proceeding without token:", recaptchaError);
            }

            let lastError = "";

            // Prepare Booking Data
            const bookingsPayload: any[] = [];

            if (bookingMode === 'combined') {
                const cfg = configs['combined'];
                if (!cfg) throw new Error("Config missing");

                // Calculate End Time
                const startTimeDate = parse(cfg.time, 'HH:mm', new Date());
                const endDate = addMinutes(startTimeDate, totalDuration);
                const endTime = format(endDate, 'HH:mm');
                const serviceNames = cart.map(c => c.service.name);

                // Prepare Items (Services + Products)
                const itemsPayload = [
                    ...cart.map(c => ({
                        id: c.serviceId,
                        nombre: c.service.name,
                        tipo: 'servicio',
                        precio: Number(c.service.price || 0),
                        barbero_id: cfg.professionalId,
                        duracion: Number(c.service.duration || 0)
                    })),
                    ...productCart.map(p => ({
                        id: p.id,
                        nombre: p.nombre,
                        tipo: 'producto',
                        precio: Number(p.public_price || 0),
                        barbero_id: null,
                        duracion: 0
                    }))
                ];

                bookingsPayload.push({
                    id: generateId(),
                    canal_reserva: 'web_publica',
                    client: clientDetails,
                    serviceIds: cart.map(c => c.serviceId),
                    serviceNames: serviceNames,
                    servicePrices: cart.map(c => Number(c.service.price || 0)),
                    items: itemsPayload, // <--- NEW: Explicit items array
                    professionalId: cfg.professionalId,
                    date: format(cfg.date, 'yyyy-MM-dd'),
                    time: cfg.time,
                    endTime: endTime,
                    duration: totalDuration,
                    locationId: cfg.professional.local_id || locales?.[0]?.id || 'default',
                    amountDue: upfrontTotal,
                    totalAmount: totalPrice,
                    paymentType: upfrontTotal < (totalPrice - 0.01) ? 'deposit' : 'full',
                    // recaptchaToken: token
                });
            } else {
                for (const item of cart) {
                    const cfg = configs[item.uniqueId];
                    if (!cfg) continue;

                    const pType = item.service.payment_type || 'no-payment';
                    const itemUpfront = (pType === 'online-deposit' ? Number(item.service.price || 0) * 0.5 : (pType === 'full-payment' ? Number(item.service.price || 0) : 0));

                    const duration = Number(item.service.duration || 30);
                    const startTimeDate = parse(cfg.time, 'HH:mm', new Date());
                    const endDate = addMinutes(startTimeDate, duration);
                    const endTime = format(endDate, 'HH:mm');

                    bookingsPayload.push({
                        id: generateId(),
                        canal_reserva: 'web_publica',
                        client: clientDetails,
                        serviceIds: [item.serviceId],
                        serviceNames: [item.service.name],
                        servicePrices: [Number(item.service.price || 0)],
                        items: [{
                            id: item.serviceId,
                            nombre: item.service.name,
                            tipo: 'servicio',
                            precio: Number(item.service.price || 0),
                            barbero_id: cfg.professionalId,
                            duracion: duration
                        }],
                        professionalId: cfg.professionalId,
                        date: format(cfg.date, 'yyyy-MM-dd'),
                        time: cfg.time,
                        endTime: endTime,
                        duration: duration,
                        locationId: cfg.professional.local_id || locales?.[0]?.id || 'default',
                        amountDue: itemUpfront,
                        totalAmount: Number(item.service.price || 0),
                        paymentType: itemUpfront < (Number(item.service.price || 0) - 0.01) ? 'deposit' : 'full',
                        // recaptchaToken: token
                    });
                }
            }

            if (upfrontTotal > 0) {
                // PAYMENT FLOW - DO NOT CREATE RESERVATION YET
                try {
                    const response = await fetch('/api/mercadopago/preference', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            // Pass the booking data to be stored in metadata
                            bookingData: bookingsPayload,
                            items: [
                                {
                                    id: 'deposit',
                                    title: `Anticipo: ${cart.map(c => c.service.name).join(', ')}`.substring(0, 250),
                                    description: `Pago de anticipo para reserva de: ${cart.map(c => c.service.name).join(', ')}`.substring(0, 250),
                                    category_id: 'services',
                                    quantity: 1,
                                    currency_id: 'MXN',
                                    unit_price: upfrontTotal
                                }
                            ],
                            payer: clientDetails
                        })
                    });

                    const data = await response.json();

                    // PRODUCTION MODE PREPARATION: 
                    // User requested "Real Production Tests". We use the standard INIT_POINT.
                    // This allows valid real payments even from localhost.
                    // The redirection issue is solved by the API handles pointing to valid https domain.

                    if (data.init_point) {
                        window.location.href = data.init_point;
                        return; // Successfully redirected
                    } else {
                        throw new Error(data.error || 'No se pudo generar el enlace de pago.');
                    }

                } catch (payError: any) {
                    console.error("Payment Error Full Details:", payError);
                    toast({
                        variant: 'destructive',
                        title: 'Error de Pago',
                        description: payError.message || "Error desconocido al contactar pasarela."
                    });
                    setIsSubmitting(false);
                }
            } else {
                // FREE FLOW - CREATE IMMEDIATELY
                for (const booking of bookingsPayload) {
                    const res = await createPublicReservation({
                        ...booking,
                        paymentStatus: 'pending',
                        recaptchaToken: token
                    });

                    if (res.success && res.reservationId) {
                        createdReservationIds.push(res.reservationId);
                    } else {
                        errorCount++;
                        lastError = res.error || "Error al crear la reserva";
                        console.error("Booking error:", res.error);
                    }
                }

                if (errorCount === 0 && createdReservationIds.length > 0) {
                    setStep(4);
                    setIsSubmitting(false);
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: lastError || 'Hubo un problema al crear la reserva.' });
                    setIsSubmitting(false);
                }
            }

        } catch (e: any) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Error', description: e.message });
            setIsSubmitting(false);
        }
    };

    // Helper to update birthday parts
    const updateBirthday = (part: 'day' | 'month' | 'year', value: string) => {
        const current = clientDetails.birthday ? parse(clientDetails.birthday, 'yyyy-MM-dd', new Date()) : new Date(2000, 0, 1);
        let newDate = current;
        if (part === 'day') newDate = set(current, { date: parseInt(value) });
        if (part === 'month') newDate = set(current, { month: parseInt(value) - 1 });
        if (part === 'year') newDate = set(current, { year: parseInt(value) });
        if (isBefore(newDate, new Date())) {
            setClientDetails({ ...clientDetails, birthday: format(newDate, 'yyyy-MM-dd') });
        }
    };

    // Derived birthday parts
    const birthDateObj = clientDetails.birthday ? parse(clientDetails.birthday, 'yyyy-MM-dd', new Date()) : null;
    const bDay = birthDateObj ? birthDateObj.getDate().toString() : '';
    const bMonth = birthDateObj ? (birthDateObj.getMonth() + 1).toString() : '';
    const bYear = birthDateObj ? birthDateObj.getFullYear().toString() : '';
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 100 }, (_, i) => (currentYear - i).toString());
    const months = [
        { val: '1', label: 'Enero' }, { val: '2', label: 'Febrero' }, { val: '3', label: 'Marzo' }, { val: '4', label: 'Abril' },
        { val: '5', label: 'Mayo' }, { val: '6', label: 'Junio' }, { val: '7', label: 'Julio' }, { val: '8', label: 'Agosto' },
        { val: '9', label: 'Septiembre' }, { val: '10', label: 'Octubre' }, { val: '11', label: 'Noviembre' }, { val: '12', label: 'Diciembre' }
    ];
    const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());


    // DYNAMIC FIELD CONFIG: Enforces requirements for payments
    const getFieldConfig = (field: string) => {
        // 1. Base Config (from Settings)
        // Check 'customerFields' (New Agtanda Standard) then Root (Legacy/Direct)
        // Matches structure seen in Firestore: settings/website/email|phone|etc
        const baseConfig = websiteSettings?.customerFields?.[field]
            || websiteSettings?.[field]
            || { use: true, required: false };

        // 2. Payment Overrides (Hybrid Logic)
        if (upfrontTotal > 0) {
            // MercadoPago REQUIRES Email & Phone.
            if (field === 'email' || field === 'phone') {
                return { use: true, required: true };
            }
        }

        // 3. Return Logic (Respects Settings)
        return baseConfig;
    };

    const formatPrice = (price: any) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(price) || 0);

    if (loadingServices || loadingProfessionals || loadingSettings) return <div className="h-screen flex items-center justify-center"><CustomLoader size={50} /></div>;

    if (websiteSettings.onlineReservations === false) {
        return (
            <div className="flex flex-col h-screen w-full items-center justify-center bg-background px-4 text-center">
                <div className="max-w-md space-y-6">
                    <div className="flex justify-center mb-6">
                        {/* Optional Logo */}
                        {empresaData?.[0]?.logo_url && (
                            <img src={empresaData[0].logo_url} alt="Logo" className="h-20 w-auto object-contain" />
                        )}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Reservas no disponibles</h1>
                    <p className="text-muted-foreground">
                        En este momento no estamos aceptando reservas en línea. Por favor, contáctanos directamente o intenta más tarde.
                    </p>
                    {empresaData?.[0]?.phone && (
                        <Button className="mt-4" onClick={() => window.location.href = `tel:${empresaData[0].phone}`}>
                            Llamar al {empresaData[0].phone}
                        </Button>
                    )}
                    <Button variant="outline" className="mt-2" onClick={() => router.push('/')}>
                        Volver al inicio
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col items-center">
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl flex flex-col min-h-[50vh] mb-24">

                {/* HEADERS */}
                <div className="bg-primary p-6 text-primary-foreground">
                    <h1 className="text-2xl font-bold mb-2">Reservar Cita</h1>
                    <div className="flex items-center gap-2 text-sm opacity-90 overflow-x-auto whitespace-nowrap">
                        <span className={step >= 0 ? 'font-bold' : ''}>1. Servicios</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className={step >= 2 ? 'font-bold' : ''}>2. Agenda</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className={step >= 3 ? 'font-bold' : ''}>3. Datos</span>
                    </div>
                </div>

                <div className="flex-1 p-6 relative flex flex-col">
                    <AnimatePresence mode="wait">

                        {/* STEP 0: SERVICE SELECTION (CART) */}
                        {step === 0 && (
                            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full relative">

                                <div className="flex-1 pb-32 px-1">
                                    <Button variant="ghost" onClick={() => router.push('/')} className="mb-2 -ml-2 text-muted-foreground w-fit">
                                        <ChevronLeft className="mr-1 h-4 w-4" /> Volver al inicio
                                    </Button>
                                    {/* Pre-selected Pro Banner */}
                                    {preSelectedProId && (() => {
                                        const pro = professionals.find(p => p.id === preSelectedProId);
                                        return pro ? (
                                            <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-lg mb-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                                <div className="h-10 w-10 rounded-full bg-white border border-primary/20 overflow-hidden shrink-0">
                                                    {pro.avatarUrl ? (
                                                        <img src={pro.avatarUrl} alt={pro.publicName || pro.name} className="h-full w-full object-cover" />
                                                    ) : (
                                                        <User className="h-full w-full p-2 text-primary" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-muted-foreground">Reservando con:</p>
                                                    <p className="font-bold text-lg leading-tight">{pro.publicName || pro.name}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-8 text-xs hover:bg-white/50" onClick={() => {
                                                    setPreSelectedProId(null);
                                                    const url = new URL(window.location.href);
                                                    url.searchParams.delete('professionalId');
                                                    window.history.replaceState({}, '', url.toString());
                                                }}>
                                                    Cambiar
                                                </Button>
                                            </div>
                                        ) : null;
                                    })()}
                                    <h2 className="text-xl font-semibold mb-2">Selecciona tus servicios</h2>
                                    <div className="grid grid-cols-1 gap-4 mb-4">
                                        {/* Regular Services */}
                                        {visibleRegularServices.map((service: any) => {
                                            const count = getCount(service.id);
                                            return (
                                                <Card key={service.id} className={cn("border-l-4 transition-all hover:shadow-md", count > 0 ? "border-l-primary" : "border-l-transparent")}>
                                                    <CardContent className="p-4 flex items-center gap-4">
                                                        {(service.images && service.images.length > 0) && (
                                                            <div className="h-16 w-16 rounded-md overflow-hidden flex-shrink-0 bg-slate-100 border">
                                                                <img src={service.images[0]} alt={service.name} className="h-full w-full object-cover" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1">
                                                            <h3 className="font-bold text-base">{service.name}</h3>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex gap-2 text-sm text-muted-foreground">
                                                                    <span>{formatPrice(service.price)}</span>
                                                                    <span>•</span>
                                                                    <span>{service.duration} min</span>
                                                                </div>
                                                                {service.payment_type === 'online-deposit' && (
                                                                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                                                                        {(() => {
                                                                            const type = service.payment_amount_type || '%';
                                                                            const val = service.payment_amount_value;
                                                                            if (type === '$' && val) return `Requiere anticipo de $${val}`;
                                                                            if (type === '%' && val) return `Requiere anticipo del ${val}%`;
                                                                            return 'Requiere anticipo del 50%';
                                                                        })()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {count > 0 && (
                                                                <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeFromCart(service.id)}>
                                                                        {count === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                                                    </Button>
                                                                    <span className="font-bold w-4 text-center">{count}</span>
                                                                </div>
                                                            )}
                                                            <Button
                                                                variant={count > 0 ? "default" : "outline"}
                                                                size="icon"
                                                                className="h-10 w-10 rounded-lg"
                                                                onClick={() => addToCart(service)}
                                                            >
                                                                <Plus className="h-5 w-5" />
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}

                                        {/* Package Services */}
                                        {visiblePackageServices.length > 0 && (
                                            <h3 className="text-lg font-semibold mt-4 mb-2">Paquetes</h3>
                                        )}
                                        {visiblePackageServices.map((service: any) => {
                                            const count = getCount(service.id);
                                            return (
                                                <Card key={service.id} className={cn("border-l-4 transition-all hover:shadow-md", count > 0 ? "border-l-primary" : "border-l-transparent")}>
                                                    <CardContent className="p-4 flex items-center gap-4">
                                                        {(service.images && service.images.length > 0) && (
                                                            <div className="h-16 w-16 rounded-md overflow-hidden flex-shrink-0 bg-slate-100 border">
                                                                <img src={service.images[0]} alt={service.name} className="h-full w-full object-cover" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1">
                                                            <h3 className="font-bold text-base">{service.name}</h3>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex gap-2 text-sm text-muted-foreground">
                                                                    <span>{formatPrice(service.price)}</span>
                                                                    <span>•</span>
                                                                    <span>{service.duration} min</span>
                                                                </div>
                                                                {service.payment_type === 'online-deposit' && (
                                                                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                                                                        {(() => {
                                                                            const type = service.payment_amount_type || '%';
                                                                            const val = service.payment_amount_value;
                                                                            if (type === '$' && val) return `Requiere anticipo de $${val}`;
                                                                            if (type === '%' && val) return `Requiere anticipo del ${val}%`;
                                                                            return 'Requiere anticipo del 50%';
                                                                        })()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {count > 0 && (
                                                                <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeFromCart(service.id)}>
                                                                        {count === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                                                    </Button>
                                                                    <span className="font-bold w-4 text-center">{count}</span>
                                                                </div>
                                                            )}
                                                            <Button
                                                                variant={count > 0 ? "default" : "outline"}
                                                                size="icon"
                                                                className="h-10 w-10 rounded-lg"
                                                                onClick={() => addToCart(service)}
                                                            >
                                                                <Plus className="h-5 w-5" />
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>

                                    {/* PRODUCTS SECTION */}
                                    <h2 className="text-xl font-semibold mb-2 mt-8 pt-4 border-t">Selecciona tus productos</h2>
                                    <div className="grid grid-cols-1 gap-4 mb-4">
                                        {productsData && productsData.length > 0 ? (
                                            productsData.filter((p: any) => p.active && p.stock > 0).map((product: any) => {
                                                const count = getProductCount(product.id);
                                                return (
                                                    <Card key={product.id} className={cn("border-l-4 transition-all hover:shadow-md", count > 0 ? "border-l-primary" : "border-l-transparent")}>
                                                        <CardContent className="p-4 flex items-center gap-4">
                                                            {(product.images && product.images.length > 0) ? (
                                                                <div className="h-16 w-16 rounded-md overflow-hidden flex-shrink-0 bg-slate-100 border">
                                                                    <img src={product.images[0]} alt={product.nombre} className="h-full w-full object-cover" />
                                                                </div>
                                                            ) : (
                                                                <div className="h-16 w-16 rounded-md bg-slate-100 flex items-center justify-center border text-muted-foreground">
                                                                    <ShoppingBag className="h-6 w-6" />
                                                                </div>
                                                            )}
                                                            <div className="flex-1">
                                                                <h3 className="font-bold text-base">{product.nombre}</h3>
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="text-sm text-muted-foreground">
                                                                        <span>{formatPrice(product.public_price)}</span>
                                                                    </div>
                                                                    {product.payment_type === 'deposit' && (
                                                                        <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                                                                            {(() => {
                                                                                const type = product.payment_amount_type || '%';
                                                                                const val = product.payment_amount_value;
                                                                                if (type === '$' && val) return `Requiere anticipo de $${val}`;
                                                                                if (type === '%' && val) return `Requiere anticipo del ${val}%`;
                                                                                return 'Requiere anticipo';
                                                                            })()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                {count > 0 && (
                                                                    <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeFromProductCart(product.id)}>
                                                                            <Minus className="h-4 w-4" />
                                                                        </Button>
                                                                        <span className="font-bold w-4 text-center">{count}</span>
                                                                    </div>
                                                                )}
                                                                <Button
                                                                    variant={count > 0 ? "default" : "outline"}
                                                                    size="icon"
                                                                    className={cn("h-10 w-10 rounded-lg", count > 0 ? "bg-primary hover:bg-primary/90" : "")}
                                                                    onClick={() => addToProductCart(product)}
                                                                >
                                                                    <Plus className="h-5 w-5" />
                                                                </Button>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                );
                                            })
                                        ) : (
                                            <p className="text-sm text-muted-foreground italic">No hay productos disponibles.</p>
                                        )}
                                    </div>
                                    <div className="h-24"></div> {/* Spacer for fixed footer */}
                                </div>
                                <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t flex justify-between items-center shadow-upper z-50 animate-in slide-in-from-bottom-5">
                                    <div>
                                        <p className="text-sm text-muted-foreground">
                                            {cart.length > 0 ? `${cart.length} servicio${cart.length !== 1 ? 's' : ''}` : ''}
                                            {cart.length > 0 && productCart.length > 0 ? ', ' : ''}
                                            {productCart.length > 0 ? `${productCart.length} producto${productCart.length !== 1 ? 's' : ''}` : ''}
                                            {cart.length === 0 && productCart.length === 0 ? 'Nada seleccionado' : ''}
                                        </p>
                                        <p className="font-bold text-lg">{formatPrice(totalPrice)}</p>
                                    </div>
                                    <Button onClick={handleServicesConfirmed} disabled={cart.length === 0} size="lg" className="shadow-lg">
                                        Continuar <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 1: MODE SELECTION */}
                        {step === 1 && (
                            <motion.div key="step1" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <Button variant="ghost" onClick={() => setStep(0)} className="mb-2 -ml-2 text-muted-foreground"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Button>
                                <h2 className="text-xl font-bold text-center mb-6">¿Cómo quieres agendar?</h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div
                                        className="border-2 rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:bg-slate-50 transition-all flex flex-col items-center text-center gap-4"
                                        onClick={() => handleModeSelection('combined')}
                                    >
                                        <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                                            <Layers className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">Uno tras otro</h3>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                Para una sola persona. Todos los servicios se realizan seguidos en una sola cita.
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        className="border-2 rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:bg-slate-50 transition-all flex flex-col items-center text-center gap-4"
                                        onClick={() => handleModeSelection('individual')}
                                    >
                                        <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                                            <CalendarDays className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">Por separado</h3>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                Para varias personas o diferentes horarios. Configura cada servicio individualmente.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 2: CONFIGURATION (DASHBOARD OR SUB-FLOW) */}
                        {step === 2 && !activeConfigId && bookingMode === 'individual' && (
                            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                <Button variant="ghost" onClick={() => setStep(cart.length > 1 ? 1 : 0)} className="mb-2 -ml-2 text-muted-foreground"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Button>
                                <h2 className="text-xl font-semibold mb-4">Configura tus citas</h2>
                                <p className="text-sm text-muted-foreground mb-4">Selecciona cada servicio para asignar fecha, hora y profesional.</p>

                                <div className="space-y-3">
                                    {cart.map((item, idx) => {
                                        const cfg = configs[item.uniqueId];
                                        return (
                                            <Card
                                                key={item.uniqueId}
                                                className={cn("cursor-pointer border hover:border-primary transition-all", cfg ? "bg-slate-50 border-green-200" : "border-dashed")}
                                                onClick={() => startConfiguration(item.uniqueId)}
                                            >
                                                <CardContent className="p-4 flex items-center justify-between">
                                                    <div>
                                                        <div className="font-bold flex items-center gap-2">
                                                            <span className="bg-slate-200 text-slate-700 text-xs w-5 h-5 rounded-full flex items-center justify-center">{idx + 1}</span>
                                                            {item.service.name}
                                                        </div>
                                                        {cfg ? (
                                                            <div className="text-sm text-green-700 mt-1 flex flex-col sm:flex-row sm:gap-3">
                                                                <span className="capitalize">{format(cfg.date, 'EEE d, MMM', { locale: es })} - {cfg.time}</span>
                                                                <span className="font-medium flex items-center gap-1"><User className="h-3 w-3" /> {cfg.professional.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm text-amber-600 font-medium mt-1 block">Pendiente de agendar</span>
                                                        )}
                                                    </div>
                                                    <div className="ml-2">
                                                        {cfg ? <Edit2 className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>

                                <div className="mt-8 flex justify-end">
                                    <Button onClick={() => setStep(3)} disabled={!isDashboardComplete} size="lg" className="w-full sm:w-auto">
                                        Siguiente <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* SUB-FLOW: DATE / TIME / PRO */}
                        {step === 2 && activeConfigId && (
                            <motion.div key="subflow" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col min-h-[400px]">
                                <div className="flex items-center mb-4">
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        if (configStep > 0) {
                                            setConfigStep(prev => prev - 1);
                                        } else {
                                            // Backing out of Date selection
                                            if (preSelectedProId) {
                                                router.push('/');
                                            } else if (bookingMode === 'combined') {
                                                if (cart.length > 1) {
                                                    setActiveConfigId(null);
                                                    setStep(1);
                                                } else {
                                                    setActiveConfigId(null);
                                                    setStep(0);
                                                }
                                            } else {
                                                setActiveConfigId(null);
                                            }
                                        }
                                    }} className="-ml-2 mr-2"><ChevronLeft /></Button>
                                    <h2 className="text-xl font-semibold">
                                        {activeConfigId === 'combined' ? 'Elige fecha y hora' : cart.find(c => c.uniqueId === activeConfigId)?.service.name}
                                    </h2>
                                </div>

                                {/* SCENARIO 1: PICK DATE */}
                                {configStep === 0 && (
                                    <div className="flex flex-col items-center">
                                        <Calendar
                                            mode="single"
                                            selected={tempDate}
                                            onSelect={(d) => {
                                                setTempDate(d);
                                                if (d) setConfigStep(1);
                                            }}
                                            disabled={(date) => isBefore(date, startOfToday())}
                                            className="rounded-md border p-4 bg-white shadow-sm mb-4"
                                            locale={es}
                                            initialFocus
                                        />
                                        <p className="text-sm text-muted-foreground">Selecciona un día para ver horarios.</p>
                                    </div>
                                )}

                                {/* SCENARIO 2: PICK TIME */}
                                {configStep === 1 && (
                                    <div className="flex flex-col h-full">
                                        <h3 className="font-medium mb-4 capitalize text-center border-b pb-2">
                                            {tempDate ? format(tempDate, 'EEEE d, MMMM', { locale: es }) : ''}
                                        </h3>

                                        {loadingSlots ? (
                                            <div className="flex-1 flex justify-center py-10"><CustomLoader size={30} /></div>
                                        ) : noCapablePros ? (
                                            <div className="text-center p-8 border border-dashed rounded-lg bg-yellow-50 border-yellow-200">
                                                <Users className="h-10 w-10 text-yellow-500 mx-auto mb-2" />
                                                <p className="text-yellow-800 font-medium mb-1">Combinación no disponible</p>
                                                <p className="text-sm text-muted-foreground mb-4">Ningún profesional disponible realiza todos estos servicios.</p>
                                                <div className="flex flex-col gap-2">
                                                    <Button variant="outline" onClick={() => setConfigStep(0)}>Cambiar Fecha</Button>
                                                    {bookingMode === 'combined' && (
                                                        <p className="text-xs text-muted-foreground mt-2">Intenta la opción <span className="font-bold">"Por separado"</span> para asignar diferentes profesionales.</p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : tempAvailableSlots.length === 0 ? (
                                            <div className="text-center p-8 border border-dashed rounded-lg bg-slate-50">
                                                <p className="text-muted-foreground">No hay horarios disponibles para esta fecha.</p>
                                                <Button variant="link" onClick={() => setConfigStep(0)}>Cambiar Fecha</Button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-3 overflow-y-auto max-h-[300px] p-1">
                                                {tempAvailableSlots.map(time => (
                                                    <Button key={time} variant="outline" onClick={() => handleTimeSelected(time)}>
                                                        {time}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SCENARIO 3: PICK PRO */}
                                {configStep === 2 && (
                                    <div className="space-y-4">
                                        <div className="text-center mb-4">
                                            <p className="text-lg font-bold">{tempTime}</p>
                                            <p className="text-sm text-muted-foreground">¿Con quién te gustaría?</p>
                                        </div>

                                        <div className="flex-1 pr-1">
                                            <div className="grid grid-cols-3 gap-3">
                                                {/* OPTION: ANY PRO */}
                                                <div
                                                    className="flex flex-col items-center p-2 rounded-xl border-2 cursor-pointer border-dashed border-slate-300 hover:border-primary/50 hover:bg-slate-50 transition-all"
                                                    onClick={() => {
                                                        const availableParams = tempSlotMap[tempTime || ''];
                                                        if (availableParams && availableParams.length > 0) {
                                                            // Auto-select the first one
                                                            handleProSelected(availableParams[0]);
                                                        }
                                                    }}
                                                >
                                                    <div className="w-full aspect-square rounded-lg bg-slate-100 flex items-center justify-center mb-2 border overflow-hidden">
                                                        {empresaData?.[0]?.icon_url ? (
                                                            <img src={empresaData[0].icon_url} alt="Icon" className="w-full h-full object-cover" />
                                                        ) : empresaData?.[0]?.logo_url ? (
                                                            <img src={empresaData[0].logo_url} alt="Logo" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Users className="h-8 w-8 text-slate-500" />
                                                        )}
                                                    </div>
                                                    <h3 className="font-bold text-xs text-center leading-tight">Primero disponible</h3>
                                                    <p className="text-[10px] text-muted-foreground text-center line-clamp-1">Automático</p>
                                                </div>

                                                {/* FILTER PROS available at this time */}
                                                {tempSlotMap[tempTime || '']?.map((proId: string) => {
                                                    const pro = professionals.find(p => p.id === proId);
                                                    if (!pro) return null;
                                                    return (
                                                        <div
                                                            key={pro.id}
                                                            className="flex flex-col items-center p-2 rounded-xl border-2 cursor-pointer hover:border-primary/50 hover:bg-slate-50 transition-all"
                                                            onClick={() => handleProSelected(pro.id)}
                                                        >
                                                            <div className="w-full aspect-square rounded-lg bg-muted overflow-hidden mb-2 border">
                                                                {pro.avatarUrl ? (
                                                                    <img src={pro.avatarUrl} alt={pro.publicName || pro.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <User className="w-full h-full p-3 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                            <h3 className="font-bold text-xs text-center leading-tight">{pro.publicName || pro.name}</h3>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}


                        {/* STEP 3: DETAILS & CONFIRMATION */}
                        {step === 3 && (
                            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                <div className="flex items-center mb-2">
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        // If only products (no services), go back to HOME, not step 2
                                        if (cart.length === 0) {
                                            router.push('/');
                                            return;
                                        }

                                        if (bookingMode === 'combined') {
                                            setActiveConfigId('combined');
                                        }
                                        setStep(2);
                                    }} className="-ml-2 mr-2"><ChevronLeft /></Button>
                                    <h2 className="text-xl font-semibold">Tus Datos</h2>
                                </div>

                                {/* PRODUCTS LIST */}
                                {productCart.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-lg flex items-center gap-2">
                                            <ShoppingBag className="h-5 w-5 text-purple-600" />
                                            Productos
                                        </h3>
                                        {productCart.map((product) => (
                                            <div key={product.id} className="flex justify-between items-center text-sm py-2 border-b border-slate-100 last:border-0 animate-in fade-in slide-in-from-top-1">
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                                                        onClick={() => setProductCart(prev => prev.filter(p => p.id !== product.id))}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                    <div>
                                                        <span className="font-medium block">{product.nombre}</span>
                                                        <span className="text-muted-foreground text-[10px] uppercase">Producto</span>
                                                    </div>
                                                </div>
                                                <span className="font-bold">{formatPrice(product.public_price)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                    <h3 className="font-bold text-lg border-b pb-2">Resumen de Compra</h3>

                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                        {/* Services */}
                                        {cart.map((item) => (
                                            <div key={item.uniqueId} className="flex justify-between text-sm text-slate-700">
                                                <span>{item.service.name}</span>
                                                <span className="font-medium">{formatPrice(item.service.price)}</span>
                                            </div>
                                        ))}

                                        {/* Products */}
                                        {productCart.map((product) => (
                                            <div key={product.id} className="flex justify-between text-sm text-slate-700">
                                                <span>{product.nombre}</span>
                                                <span className="font-medium">{formatPrice(product.public_price)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border-t border-slate-300 pt-3 space-y-1">
                                        <div className="flex justify-between text-lg font-bold">
                                            <span>Total</span>
                                            <span>{formatPrice(totalPrice)}</span>
                                        </div>
                                        {upfrontTotal > 0 && (
                                            <>
                                                <div className="flex justify-between text-base font-semibold text-blue-600">
                                                    <span>Pagar ahora en línea</span>
                                                    <span>{formatPrice(upfrontTotal)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-muted-foreground">
                                                    <span>Pendiente en local</span>
                                                    <span>{formatPrice(totalPrice - upfrontTotal)}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Nombre <span className="text-red-500">*</span></Label>
                                            <Input
                                                id="name"
                                                placeholder="Juan"
                                                value={clientDetails.name}
                                                onChange={(e) => setClientDetails({ ...clientDetails, name: correctName(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="lastname">Apellido <span className="text-red-500">*</span></Label>
                                            <Input
                                                id="lastname"
                                                placeholder="Pérez"
                                                value={clientDetails.lastName}
                                                onChange={(e) => setClientDetails({ ...clientDetails, lastName: correctName(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    {/* Email (Optional/Required) */}
                                    {getFieldConfig('email').use && (
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email {getFieldConfig('email').required && <span className="text-red-500">*</span>}</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                placeholder="tu@email.com"
                                                value={clientDetails.email}
                                                onChange={(e) => setClientDetails({ ...clientDetails, email: e.target.value })}
                                                className={
                                                    clientDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientDetails.email)
                                                        ? "border-red-500 bg-red-50"
                                                        : ""
                                                }
                                            />
                                            {clientDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientDetails.email) && (
                                                <p className="text-[10px] text-red-500">Formato de email incorrecto.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Celular */}
                                    {getFieldConfig('phone').use && (
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">Celular (10 dígitos) {getFieldConfig('phone').required && <span className="text-red-500">*</span>}</Label>
                                            <Input
                                                id="phone"
                                                type="tel"
                                                placeholder="5512345678"
                                                value={clientDetails.phone}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                    setClientDetails({ ...clientDetails, phone: val });
                                                }}
                                                className={
                                                    (clientDetails.phone.length > 0 && clientDetails.phone.length < 10) || (clientDetails.phone.length === 10 && /^(\d)\1{9}$/.test(clientDetails.phone))
                                                        ? "border-red-500 bg-red-50"
                                                        : ""
                                                }
                                            />
                                            {clientDetails.phone.length === 10 && /^(\d)\1{9}$/.test(clientDetails.phone) && (
                                                <p className="text-[10px] text-red-500">Número inválido.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Dirección */}
                                    {getFieldConfig('address').use && (
                                        <div className="space-y-2">
                                            <Label htmlFor="address">Dirección {getFieldConfig('address').required && <span className="text-red-500">*</span>}</Label>
                                            <Input
                                                id="address"
                                                placeholder="Calle 123, Colonia..."
                                                value={clientDetails.address}
                                                onChange={(e) => setClientDetails({ ...clientDetails, address: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    {/* Notas */}
                                    {getFieldConfig('notes').use && (
                                        <div className="space-y-2">
                                            <Label htmlFor="notes">Notas {getFieldConfig('notes').required && <span className="text-red-500">*</span>}</Label>
                                            <Input
                                                id="notes"
                                                placeholder="Alergias, preferencias..."
                                                value={clientDetails.notes}
                                                onChange={(e) => setClientDetails({ ...clientDetails, notes: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    {/* Cumpleaños */}
                                    {getFieldConfig('dob').use && (
                                        <div className="space-y-2">
                                            <Label>Cumpleaños (¡Podrías recibir un regalo! 🎁) {getFieldConfig('dob').required && <span className="text-red-500">*</span>}</Label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <Select value={bDay} onValueChange={(v) => updateBirthday('day', v)}>
                                                    <SelectTrigger><SelectValue placeholder="Día" /></SelectTrigger>
                                                    <SelectContent>
                                                        {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>

                                                <Select value={bMonth} onValueChange={(v) => updateBirthday('month', v)}>
                                                    <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                                                    <SelectContent>
                                                        {months.map(m => <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>

                                                <Select value={bYear} onValueChange={(v) => updateBirthday('year', v)}>
                                                    <SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger>
                                                    <SelectContent>
                                                        {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="h-24"></div> {/* Spacer for fixed button */}

                                <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t z-50 shadow-upper flex flex-col items-center justify-center animate-in slide-in-from-bottom-5">
                                    <div className="w-full max-w-md">
                                        <Button
                                            className="w-full shadow-lg h-12 text-lg"
                                            onClick={confirmBooking}
                                            disabled={
                                                !clientDetails.name ||
                                                !clientDetails.lastName ||
                                                isSubmitting ||
                                                (getFieldConfig('phone').use && getFieldConfig('phone').required && (clientDetails.phone.length !== 10 || /^(\d)\1{9}$/.test(clientDetails.phone))) ||
                                                (getFieldConfig('email').use && getFieldConfig('email').required && (!clientDetails.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientDetails.email))) ||
                                                (getFieldConfig('address').use && getFieldConfig('address').required && !clientDetails.address) ||
                                                (getFieldConfig('notes').use && getFieldConfig('notes').required && !clientDetails.notes) ||
                                                (getFieldConfig('dob').use && getFieldConfig('dob').required && !clientDetails.birthday)
                                            }
                                        >
                                            {isSubmitting ? (
                                                <div className="flex items-center gap-2">
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    <span>Procesando...</span>
                                                </div>
                                            ) : (upfrontTotal > 0 ? "Proceder al Pago" : "Confirmar Reserva")}
                                        </Button>
                                    </div>
                                    {upfrontTotal > 0 && (
                                        <p className="text-[10px] text-center text-muted-foreground mt-2">
                                            Tu pago será procesado de forma segura por Mercado Pago.
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 4: SUCCESS */}
                        {step === 4 && (
                            <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4 animate-in zoom-in duration-500 shadow-xl shadow-primary/20 ring-1 ring-primary/20">
                                    <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white shadow-inner">
                                        <Check className="w-8 h-8" />
                                    </div>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800">¡Reserva Confirmada!</h2>
                                <p className="text-muted-foreground max-w-sm">
                                    Gracias <strong>{clientDetails.name}</strong>, tus citas han sido agendadas con éxito.
                                </p>
                                {websiteSettings.predefinedNotes && (
                                    <div className="bg-muted border border-slate-200 text-foreground p-4 rounded-xl mt-4 max-w-md text-sm shadow-sm whitespace-pre-line">
                                        {websiteSettings.predefinedNotes.replace('3 horas antes. ', '3 horas antes.\n')}
                                    </div>
                                )}
                                <Button className="mt-8 shadow-lg" size="lg" onClick={() => router.push('/')}>
                                    Volver al Inicio
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>


                    <div className="mt-4 text-[10px] text-center text-muted-foreground">
                        Este sitio está protegido por reCAPTCHA y se aplican la{' '}
                        <a href="https://policies.google.com/privacy" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Política de Privacidad</a> y los{' '}
                        <a href="https://policies.google.com/terms" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Términos de Servicio</a> de Google.
                    </div>

                </div>
            </div>
        </div >
    );
}


