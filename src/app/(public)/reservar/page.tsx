'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { VatosButton } from '@/components/ui/vatos-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { CustomLoader } from '@/components/ui/custom-loader';
import { format, isBefore, startOfToday, parse, set, addMinutes, isAfter, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Check, CheckCircle, ChevronLeft, ChevronRight, Clock, User, Scissors, Users, Trash2, Plus, Minus, CalendarDays, Layers, UserCheck, Edit2, ShoppingBag, Loader2, Sparkles, X, Share2, Info, ShieldCheck, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createPublicReservation, getAvailableSlots, getPublicServiciosConfig, checkClientBookingEligibility } from '@/lib/actions/booking';
import { trackGoogleAdsReservation } from '@/lib/google-ads';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import { where } from 'firebase/firestore';
import Image from 'next/image';
import { getServiceLocalImage } from '@/lib/service-images';
import { LegalModals } from './LegalModals';


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
    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            // Offset for fixed header/nav if needed, though block: 'start' is usually fine
            // Adding a small offset for better visibility under sticky headers if present
            const yOffset = -20;
            const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    };

    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast: shadToast } = useToast();
    const toast = Object.assign(
        (props: any) => shadToast(props),
        {
            success: (msg: string) => shadToast({ description: msg, className: "bg-[#18223c] text-white border-blue-500/40" }),
            error: (msg: string) => shadToast({ variant: "destructive", description: msg }),
        }
    );
    const executeRecaptcha = async (action?: string) => "mock-token";

    // Data Queries
    const { data: services = [], loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: productsData = [], loading: loadingProducts } = useFirestoreQuery<any>('productos');
    const { data: rawProfessionals = [], loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const professionals = useMemo(() => rawProfessionals.filter((p: any) => p.active && !p.deleted && p.acceptsOnline), [rawProfessionals]);
    const { data: settingsDocs = [], loading: loadingSettings } = useFirestoreQuery<any>('settings');
    const websiteSettings: any = settingsDocs.find((d: any) => d.id === 'website') || {};
    const { data: empresaData = [] } = useFirestoreQuery<any>('empresa');
    const { data: locales = [] } = useFirestoreQuery<any>('locales');
    const { data: categories = [] } = useFirestoreQuery<any>('categorias_servicios');
    const { data: promotions = [] } = useFirestoreQuery<any>('promociones');

    // Configuración de Anticipos (Carga desde Server Action con valores de respaldo $190 / 50%)
    const [serviciosConfigState, setServiciosConfigState] = useState<any>({
        anticipo_monto_minimo_activo: true,
        anticipo_monto_minimo: 190,
        anticipo_porcentaje_defecto: 50
    });

    useEffect(() => {
        getPublicServiciosConfig().then((cfg) => {
            if (cfg) {
                setServiciosConfigState(cfg);
            }
        }).catch((err) => {
            console.error("Error al obtener configuración pública de servicios:", err);
        });
    }, []);

    const serviciosConfig = serviciosConfigState;

    // Filter active promotions (active and not expired)
    const activePromotions = useMemo(() => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return promotions?.filter((p: any) => p.active && (!p.endDate || today <= p.endDate)) || [];
    }, [promotions]);



    // Core State
    const [cart, setCart] = useState<CartItem[]>([]);
    const [productCart, setProductCart] = useState<any[]>([]);
    const [selectedPromotion, setSelectedPromotion] = useState<any>(null); // For Terms Modal
    const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
    const [termsModalOpen, setTermsModalOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
    const [historyRequiresDeposit, setHistoryRequiresDeposit] = useState(false);
    const [historyPenaltyPercent, setHistoryPenaltyPercent] = useState(50);
    const [historyPenaltyCount, setHistoryPenaltyCount] = useState(0);

    // Escudo Anti-Fragmentación (Acumulado Diario y Citas Múltiples)
    const [sameDayRequiresDeposit, setSameDayRequiresDeposit] = useState(false);
    const [sameDayActiveCount, setSameDayActiveCount] = useState(0);
    const [sameDayActiveTotal, setSameDayActiveTotal] = useState(0);
    const [sameDayAccumulatedTotal, setSameDayAccumulatedTotal] = useState(0);
    const [sameDayDepositMessage, setSameDayDepositMessage] = useState('');
    const [sameDayDepositPercent, setSameDayDepositPercent] = useState(50);

    // MODO SANDBOX / PRUEBAS LOCALES (Aislamiento de Agenda)
    const [isLocalhost, setIsLocalhost] = useState(false);
    const [isSandboxMode, setIsSandboxMode] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isLocal = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' || 
                            window.location.search.includes('sandbox=true') ||
                            window.location.search.includes('test=true');
            setIsLocalhost(isLocal);
            setIsSandboxMode(isLocal); // Activo por defecto al estar en entorno local
        }
    }, []);

    // Determinar la fecha objetivo seleccionada para la reserva
    const selectedBookingDateStr = useMemo(() => {
        if (bookingMode === 'combined' && configs['combined']?.date) {
            return format(configs['combined'].date, 'yyyy-MM-dd');
        }
        for (const item of cart) {
            if (configs[item.uniqueId]?.date) {
                return format(configs[item.uniqueId].date, 'yyyy-MM-dd');
            }
        }
        if (tempDate) {
            return format(tempDate, 'yyyy-MM-dd');
        }
        return '';
    }, [bookingMode, configs, cart, tempDate]);

    const currentCartTotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + Number(item.service?.price || 0), 0);
    }, [cart]);

    // Verificación de historial de cliente y citas del mismo día (Escudo Antifraude + Anti-Fragmentación)
    useEffect(() => {
        let active = true;
        const phone = clientDetails.phone?.trim();
        const email = clientDetails.email?.trim();
        const identifier = (phone && phone.length === 10) ? phone : (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '');

        if (identifier) {
            checkClientBookingEligibility(identifier, selectedBookingDateStr, currentCartTotal).then((res) => {
                if (active) {
                    setHistoryRequiresDeposit(res.requiresDepositDueToHistory);
                    setHistoryPenaltyCount(res.citas_no_asistidas || res.totalFaltas || 0);
                    if (res.penalizacion_anticipo_porcentaje) {
                        setHistoryPenaltyPercent(res.penalizacion_anticipo_porcentaje);
                    }
                    setSameDayRequiresDeposit(res.requiresDepositDueToSameDay);
                    setSameDayActiveCount(res.sameDayActiveCount || 0);
                    setSameDayActiveTotal(res.sameDayActiveTotal || 0);
                    setSameDayAccumulatedTotal(res.sameDayAccumulatedTotal || 0);
                    setSameDayDepositMessage(res.sameDayDepositReason || '');
                    if (res.sameDayDepositPercent) {
                        setSameDayDepositPercent(res.sameDayDepositPercent);
                    }
                }
            }).catch(() => {});
        } else {
            setHistoryRequiresDeposit(false);
            setHistoryPenaltyCount(0);
            setSameDayRequiresDeposit(false);
            setSameDayActiveCount(0);
            setSameDayActiveTotal(0);
            setSameDayAccumulatedTotal(0);
            setSameDayDepositMessage('');
        }

        return () => {
            active = false;
        };
    }, [clientDetails.phone, clientDetails.email, selectedBookingDateStr, currentCartTotal]);

    // --- INITIALIZATION ---
    useEffect(() => {
        if (cart.length > 0 || services.length === 0) return;

        const servicesParam = searchParams.get('services');
        const productsParam = searchParams.get('products'); // Read products from URL
        const legacyServiceId = searchParams.get('serviceId');
        const proIdParam = searchParams.get('professionalId');

        if (proIdParam && !preSelectedProId) {
            setPreSelectedProId(proIdParam); // Set raw value first, will be resolved below
        }

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

    // --- RESOLVE professionalId: Auth UID -> Firestore Document ID ---
    // The share links may use the Firebase Auth UID (user.uid) instead of the Firestore
    // document ID. This effect translates it once the professionals list is loaded.
    useEffect(() => {
        if (!preSelectedProId || professionals.length === 0) return;

        // Check if it already matches a document ID
        const directMatch = professionals.find((p: any) => p.id === preSelectedProId);
        if (directMatch) return; // Already a valid Firestore document ID, nothing to do

        // Check if it matches a userId (Firebase Auth UID)
        const byUserId = professionals.find((p: any) => p.userId === preSelectedProId);
        if (byUserId) {
            console.log(`[Booking] Resolved Auth UID "${preSelectedProId}" -> Document ID "${byUserId.id}"`);
            setPreSelectedProId(byUserId.id); // Translate to the correct document ID
        }
    }, [preSelectedProId, professionals]);

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
    const { totalPrice, upfrontTotal, isThresholdDepositApplied } = useMemo(() => {
        const total = cart.reduce((acc, item) => acc + Number(item.service.price || 0), 0);
        let upfront = cart.reduce((sum, item) => {
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

        // Regla 1: Escudo Antifraude por Inasistencias / Cancelaciones (Máxima Prioridad)
        if (historyRequiresDeposit && total > 0) {
            const pct = (Number(historyPenaltyPercent) || 50) / 100;
            const requiredHistoryDeposit = total * pct;
            if (upfront < requiredHistoryDeposit) {
                upfront = requiredHistoryDeposit;
            }
        }

        // Regla 1.5: Escudo Anti-Fragmentación y Acumulado Diario (Citas previas activas en la misma fecha)
        let sameDayApplied = false;
        if (sameDayRequiresDeposit && total > 0) {
            const pct = (Number(sameDayDepositPercent) || 50) / 100;
            const requiredSameDayDeposit = total * pct;
            if (upfront < requiredSameDayDeposit) {
                upfront = requiredSameDayDeposit;
                sameDayApplied = true;
            }
        }

        // Regla 3: Anticipo global automático si el monto total de servicios alcanza o supera el umbral configurado
        let thresholdApplied = false;
        const isThresholdActive = serviciosConfig?.anticipo_monto_minimo_activo !== false;
        const minThreshold = Number(serviciosConfig?.anticipo_monto_minimo) > 0 ? Number(serviciosConfig.anticipo_monto_minimo) : 190;
        const defaultPercent = Number(serviciosConfig?.anticipo_porcentaje_defecto) > 0 ? Number(serviciosConfig.anticipo_porcentaje_defecto) : 50;

        if (
            isThresholdActive &&
            minThreshold > 0 &&
            total >= minThreshold
        ) {
            const pct = defaultPercent / 100;
            const requiredMinDeposit = total * pct;
            if (upfront < requiredMinDeposit) {
                upfront = requiredMinDeposit;
                thresholdApplied = true;
            }
        }

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
            upfrontTotal: upfront + productUpfront,
            isThresholdDepositApplied: thresholdApplied,
            isSameDayDepositApplied: sameDayApplied
        };
    }, [cart, productCart, serviciosConfig, historyRequiresDeposit, historyPenaltyPercent, sameDayRequiresDeposit, sameDayDepositPercent]);
    const totalDuration = useMemo(() => cart.reduce((acc, item) => acc + Number(item.service.duration || 0), 0), [cart]);

    // --- SORTED SERVICES ---
    const { visibleRegularServices, visiblePackageServices } = useMemo(() => {
        let available = services.filter((s: any) => s.active && !s.deleted && s.visible_en_web !== false);

        if (preSelectedProId) {
            available = available.filter((s: any) => {
                const pro = professionals.find((p: any) => p.id === preSelectedProId);
                if (pro && pro.services && pro.services.length > 0) {
                    return pro.services.includes(s.id);
                }
                // Si el profesional no tiene servicios asignados, le mostramos todos por defecto
                return true;
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
                const promises = capablePros.map((p: any) => {
                    let profDuration = 0;
                    if (activeConfigId === 'combined') {
                        profDuration = cart.reduce((acc, item) => {
                            const customDur = item.service.durationPorProfesional?.[p.id];
                            return acc + Number(customDur !== undefined ? customDur : (item.service.duration || 0));
                        }, 0);
                    } else {
                        const item = cart.find(c => c.uniqueId === activeConfigId);
                        if (item) {
                            const customDur = item.service.durationPorProfesional?.[p.id];
                            profDuration = Number(customDur !== undefined ? customDur : (item.service.duration || 0));
                        }
                    }
                    if (profDuration === 0) profDuration = 30;

                    return getAvailableSlots({ date: dateStr, professionalId: p.id, durationMinutes: profDuration })
                        .catch(err => {
                            console.error(`Error fetching slots for pro ${p.name}:`, err);
                            return { error: err.message || 'Unknown network error' };
                        });
                });

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
                        // Handle Server Action mismatch (deployment) errors
                        if ((errorFound as string).includes("Server Action") || (errorFound as string).includes("not found on the server")) {
                            toast({
                                title: 'Actualización en curso',
                                description: 'Detectamos una nueva versión del sistema. Recargando la página...',
                                duration: 3000
                            });
                            setTimeout(() => window.location.reload(), 2000);
                            return;
                        }
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

                // Calculate End Time based on selected professional
                const actualTotalDuration = cart.reduce((acc, item) => {
                    const customDur = item.service.durationPorProfesional?.[cfg.professionalId || ''];
                    return acc + Number(customDur !== undefined ? customDur : (item.service.duration || 0));
                }, 0);
                
                const startTimeDate = parse(cfg.time, 'HH:mm', new Date());
                const endDate = addMinutes(startTimeDate, actualTotalDuration);
                const endTime = format(endDate, 'HH:mm');
                const serviceNames = cart.map(c => c.service.name);

                // Prepare Items (Services + Products)
                const itemsPayload = [
                    ...cart.map(c => {
                        const customDur = c.service.durationPorProfesional?.[cfg.professionalId || ''];
                        return {
                            id: c.serviceId,
                            nombre: c.service.name,
                            tipo: 'servicio',
                            precio: Number(c.service.price || 0),
                            barbero_id: cfg.professionalId,
                            duracion: Number(customDur !== undefined ? customDur : (c.service.duration || 0))
                        };
                    }),
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
                    duration: actualTotalDuration,
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

                    const itemPrice = Number(item.service.price || 0);
                    const pType = item.service.payment_type || 'no-payment';
                    let itemUpfront = (pType === 'online-deposit' ? itemPrice * 0.5 : (pType === 'full-payment' ? itemPrice : 0));
                    if ((isThresholdDepositApplied || historyRequiresDeposit || sameDayRequiresDeposit) && itemUpfront === 0) {
                        const pct = historyRequiresDeposit 
                            ? ((Number(historyPenaltyPercent) || 50) / 100) 
                            : (sameDayRequiresDeposit
                                ? ((Number(sameDayDepositPercent) || 50) / 100)
                                : ((Number(serviciosConfig?.anticipo_porcentaje_defecto) || 50) / 100));
                        itemUpfront = itemPrice * pct;
                    }

                    const customDur = item.service.durationPorProfesional?.[cfg.professionalId || ''];
                    const duration = Number(customDur !== undefined ? customDur : (item.service.duration || 30));
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

            if (upfrontTotal > 0 && !isSandboxMode) {
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
                // FREE FLOW O SIMULACIÓN EN MODO SANDBOX (NO AFECTA LA AGENDA REAL)
                for (const booking of bookingsPayload) {
                    const res = await createPublicReservation({
                        ...booking,
                        paymentStatus: (upfrontTotal > 0 && isSandboxMode) ? 'deposit_paid' : 'pending',
                        isSandbox: isSandboxMode,
                        recaptchaToken: token
                    });

                    if (res.success && res.reservationId) {
                        createdReservationIds.push(res.reservationId);
                        if (res.warning) {
                            console.warn("SERVER WARNING:", res.warning);
                            if (!isSandboxMode) {
                                toast({ variant: "destructive", title: "Aviso del Sistema", description: res.warning, duration: 10000 });
                            }
                        }
                    } else {
                        errorCount++;
                        lastError = res.error || "Error al crear la reserva";
                        console.error("Booking error:", res.error);
                    }
                }

                if (errorCount === 0 && createdReservationIds.length > 0) {
                    if (!isSandboxMode) {
                        // Trigger isolated Google Ads conversion tracking for each confirmed reservation ID
                        createdReservationIds.forEach((resId) => {
                            trackGoogleAdsReservation({
                                reservationId: resId,
                                value: totalPrice,
                                currency: 'MXN',
                            });
                        });
                    }
                    setStep(5);
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

    const isStep3Valid = useMemo(() => {
        if (!clientDetails.name?.trim() || !clientDetails.lastName?.trim()) return false;
        if (getFieldConfig('phone').use && getFieldConfig('phone').required) {
            if (clientDetails.phone.length !== 10 || /^(\d)\1{9}$/.test(clientDetails.phone)) return false;
        }
        if (getFieldConfig('email').use && getFieldConfig('email').required) {
            if (!clientDetails.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientDetails.email)) return false;
        }
        if (getFieldConfig('address').use && getFieldConfig('address').required && !clientDetails.address?.trim()) return false;
        if (getFieldConfig('notes').use && getFieldConfig('notes').required && !clientDetails.notes?.trim()) return false;
        if (getFieldConfig('dob').use && getFieldConfig('dob').required && !clientDetails.birthday) return false;
        return true;
    }, [clientDetails, getFieldConfig]);

    const formatPrice = (price: any) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(price) || 0);

    if (loadingServices || loadingProfessionals || loadingSettings) return (
        <div className="min-h-screen bg-white md:bg-gray-100 flex items-center justify-center p-0 md:p-6 pb-24 md:pb-6 animate-pulse">
            <div className="w-full max-w-2xl bg-white md:rounded-2xl md:shadow-2xl overflow-hidden flex flex-col h-screen md:h-[85vh]">
                <div className="bg-zinc-900 h-24 sm:h-32 w-full flex items-center justify-center">
                    <div className="h-10 w-48 bg-zinc-700 rounded-md"></div>
                </div>
                <div className="p-4 flex gap-4 overflow-hidden border-b border-gray-100">
                    <div className="h-8 w-24 bg-gray-200 rounded-full"></div>
                    <div className="h-8 w-24 bg-gray-200 rounded-full"></div>
                    <div className="h-8 w-24 bg-gray-200 rounded-full"></div>
                </div>
                <div className="p-6 flex-1 flex flex-col gap-6">
                    <div className="h-6 w-1/3 bg-gray-200 rounded-md mb-2"></div>
                    <div className="h-24 w-full bg-gray-100 rounded-xl"></div>
                    <div className="h-24 w-full bg-gray-100 rounded-xl"></div>
                    <div className="h-24 w-full bg-gray-100 rounded-xl"></div>
                </div>
            </div>
        </div>
    );

    if (websiteSettings.onlineReservations === false) {
        return (
            <div className="flex flex-col h-screen w-full items-center justify-center bg-background px-4 text-center">
                <div className="max-w-md space-y-6">
                    <div className="flex justify-center mb-6">
                        {/* Optional Logo */}
                        {empresaData?.[0]?.logo_url && (
                            <img src={empresaData[0].logo_url} alt="Logo" className="h-20 w-auto object-contain" loading="lazy" />
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

    const handleTopBack = () => {
        if (step <= 0 || step === 5) {
            router.push('/');
        } else if (step === 4) {
            setStep(3);
        } else if (step === 3) {
            if (cart.length === 0) {
                router.push('/');
                return;
            }
            if (bookingMode === 'combined') {
                setActiveConfigId('combined');
            }
            setStep(2);
        } else if (step === 2) {
            if (configStep > 0) {
                setConfigStep(prev => prev - 1);
            } else {
                if (bookingMode === 'combined' && cart.length > 1) {
                    setActiveConfigId(null);
                    setStep(1);
                } else {
                    setActiveConfigId(null);
                    setStep(0);
                }
            }
        } else if (step === 1) {
            setStep(0);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0b0f19] via-[#0f172a] to-[#0b0f19] text-foreground p-3 sm:p-6 md:p-8 flex flex-col items-center selection:bg-blue-500/20">
            <div className={cn("w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] border border-slate-200 dark:border-slate-800 flex flex-col min-h-[50vh] overflow-hidden", step === 0 ? "mb-28" : "mb-8 sm:mb-12")}>

                {/* CABECERA OFICIAL VATOS ALFA CON HAZ DE LUZ Y LOGO */}
                <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-6 text-white border-b border-[#2d3a60]/60 shrink-0">
                    <div className="header-light-beam" aria-hidden="true" />
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        {/* Fila 1 en móvil / Lado izquierdo en desktop */}
                        <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
                            <div className="flex items-center gap-3">
                                <div className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-full overflow-hidden border-2 border-[#C5A880]/60 shadow-[0_0_15px_rgba(197,168,128,0.25)] shrink-0">
                                    <Image
                                        src="/logo-v-400x400.webp"
                                        alt="VATOS ALFA"
                                        fill
                                        className="object-cover"
                                        priority
                                    />
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#C5A880]">VATOS ALFA Barber Shop</span>
                                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Reservar Cita</h1>
                                </div>
                            </div>

                            {/* Botón Regresar en móvil (arriba a la derecha) */}
                            <button
                                type="button"
                                onClick={handleTopBack}
                                className="sm:hidden inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-xl border border-white/10 transition-colors cursor-pointer shrink-0"
                                title={step === 0 ? "Volver al inicio" : "Regresar al paso anterior"}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                <span>Regresar</span>
                            </button>
                        </div>

                        {/* Fila 2 en móvil / Lado derecho en desktop: Stepper + Botón Regresar (en desktop) */}
                        <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto overflow-x-auto max-w-full">
                            {/* Stepper oficial Vatos Alfa con 4 pasos */}
                            <div className="flex items-center gap-1 sm:gap-1.5 text-xs font-semibold overflow-x-auto whitespace-nowrap bg-black/40 backdrop-blur-md px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border border-white/10">
                                <div className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-all", step >= 0 && step <= 1 ? "bg-blue-600 text-white shadow-sm font-bold" : step > 1 ? "text-blue-300 font-medium" : "text-slate-400")}>
                                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", step >= 0 && step <= 1 ? "bg-white text-blue-900 font-bold" : "bg-white/20 text-white")}>1</span>
                                    <span>Servicios</span>
                                </div>
                                <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-500 shrink-0" />
                                <div className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-all", step === 2 ? "bg-blue-600 text-white shadow-sm font-bold" : step > 2 ? "text-blue-300 font-medium" : "text-slate-400")}>
                                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", step === 2 ? "bg-white text-blue-900 font-bold" : "bg-white/20 text-white")}>2</span>
                                    <span>Agenda</span>
                                </div>
                                <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-500 shrink-0" />
                                <div className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-all", step === 3 ? "bg-blue-600 text-white shadow-sm font-bold" : step > 3 ? "text-blue-300 font-medium" : "text-slate-400")}>
                                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", step === 3 ? "bg-white text-blue-900 font-bold" : "bg-white/20 text-white")}>3</span>
                                    <span>Datos</span>
                                </div>
                                <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-500 shrink-0" />
                                <div className={cn("flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-all", step === 4 ? "bg-blue-600 text-white shadow-sm font-bold" : step > 4 ? "text-blue-300 font-medium" : "text-slate-400")}>
                                    <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px]", step === 4 ? "bg-white text-blue-900 font-bold" : "bg-white/20 text-white")}>4</span>
                                    <span>Pago</span>
                                </div>
                            </div>

                            {/* Botón Regresar en desktop (arriba al extremo derecho) */}
                            <button
                                type="button"
                                onClick={handleTopBack}
                                className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-xl border border-white/10 transition-colors cursor-pointer shrink-0"
                                title={step === 0 ? "Volver al inicio" : "Regresar al paso anterior"}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                <span>Regresar</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-4 sm:p-6 md:p-8 relative flex flex-col">
                    {/* BANNER MODO PRUEBAS / SANDBOX (Solo visible en localhost / ?sandbox=true) */}
                    {isLocalhost && (
                        <div className="mb-5 p-3 sm:p-3.5 rounded-2xl border-2 border-blue-500/40 bg-blue-950/70 text-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_4px_20px_rgba(59,130,246,0.15)] animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-2.5">
                                <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-white tracking-tight">Modo Sandbox / Pruebas Local</p>
                                        <span className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                            isSandboxMode ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "bg-slate-700/50 text-slate-400 border border-slate-600"
                                        )}>
                                            {isSandboxMode ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-300 mt-0.5">
                                        {isSandboxMode
                                            ? 'Las citas se validan de forma real pero NO se guardan en la agenda de la barbería ni envían correos a clientes.'
                                            : 'Atención: El modo prueba está apagado. Las citas se registrarán directamente en la agenda en vivo.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSandboxMode(!isSandboxMode)}
                                className={cn(
                                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border",
                                    isSandboxMode
                                        ? "bg-blue-600 text-white border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                                        : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700"
                                )}
                            >
                                {isSandboxMode ? 'Desactivar Modo Prueba' : 'Activar Modo Prueba'}
                            </button>
                        </div>
                    )}

                    <AnimatePresence mode="wait">

                        {/* STEP 0: SERVICE SELECTION (CART) */}
                        {step === 0 && (
                            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full relative">

                                <div className="flex-1 pb-32 px-1">

                                    {/* Pre-selected Pro Banner */}
                                    {preSelectedProId && (() => {
                                        const pro = professionals.find(p => p.id === preSelectedProId);
                                        return pro ? (
                                            <div className="bg-blue-50/60 dark:bg-blue-950/20 border-2 border-blue-500/40 p-3.5 rounded-xl mb-5 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                                <div className="h-11 w-11 rounded-full bg-white dark:bg-slate-800 border-2 border-blue-500 overflow-hidden shrink-0 shadow-sm relative">
                                                    {pro.avatarUrl ? (
                                                        <img src={pro.avatarUrl} alt={pro.publicName || pro.name} className="h-full w-full object-cover" loading="lazy" />
                                                    ) : (
                                                        <User className="h-full w-full p-2 text-blue-500" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-semibold text-muted-foreground">Reservando con:</p>
                                                    <p className="font-bold text-base sm:text-lg leading-tight text-foreground">{pro.publicName || pro.name}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold hover:bg-white/50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => {
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
                                    <h2 id="servicios" className="text-xl font-bold tracking-tight text-foreground mb-3 scroll-mt-24">Selecciona tus servicios</h2>
                                    <div className="grid grid-cols-1 gap-3.5 sm:gap-4 mb-4">
                                        {/* Regular Services */}
                                        {visibleRegularServices.map((service: any) => {
                                            const count = getCount(service.id);
                                            return (
                                                <Card key={service.id} className={cn("rounded-2xl border transition-all duration-200 hover:shadow-md", count > 0 ? "border-blue-500 bg-blue-500/5 shadow-xs" : "border-border/70 hover:border-blue-500/50")}>
                                                    <CardContent className="p-3.5 sm:p-4 flex items-center gap-3.5 sm:gap-4">
                                                        {(service.images && service.images.length > 0) && (
                                                            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-border/50 relative shadow-xs">
                                                                <Image 
                                                                    src={service.images[0] || getServiceLocalImage(service.name, service.images) || '/services/corte-de-cabello.webp'}
                                                                    alt={service.name} 
                                                                    fill
                                                                    className="object-cover" 
                                                                    unoptimized
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-sm sm:text-base text-foreground leading-snug">{service.name}</h3>
                                                            <div className="flex flex-col gap-1 mt-0.5">
                                                                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                                                    <span className="font-sans font-bold text-foreground">{formatPrice(service.price)}</span>
                                                                    <span>•</span>
                                                                    <span>{service.duration} min</span>
                                                                </div>
                                                                {service.payment_type === 'online-deposit' && (
                                                                    <span className="text-[11px] text-[#C5A880] font-semibold bg-[#C5A880]/10 border border-[#C5A880]/30 px-2 py-0.5 rounded-md w-fit">
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
                                                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                                            {count > 0 && (
                                                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-border/50">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer" onClick={() => removeFromCart(service.id)}>
                                                                        {count === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                                                    </Button>
                                                                    <span className="font-bold font-sans w-4 text-center text-sm">{count}</span>
                                                                </div>
                                                            )}
                                                            <Button
                                                                variant={count > 0 ? "default" : "outline"}
                                                                size="icon"
                                                                className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-xl cursor-pointer transition-all", count > 0 ? "bg-[#202A49] hover:bg-[#18223c] text-white shadow-sm" : "border-border hover:border-blue-500 hover:bg-blue-500/10")}
                                                                onClick={() => addToCart(service)}
                                                            >
                                                                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}

                                        {/* Package Services */}
                                        {visiblePackageServices.length > 0 && (
                                            <h3 id="paquetes" className="text-lg font-bold tracking-tight text-foreground mt-6 mb-2 scroll-mt-24">Paquetes</h3>
                                        )}
                                        {visiblePackageServices.map((service: any) => {
                                            const count = getCount(service.id);
                                            return (
                                                <Card key={service.id} className={cn("rounded-2xl border transition-all duration-200 hover:shadow-md", count > 0 ? "border-blue-500 bg-blue-500/5 shadow-xs" : "border-border/70 hover:border-blue-500/50")}>
                                                    <CardContent className="p-3.5 sm:p-4 flex items-center gap-3.5 sm:gap-4">
                                                        {(service.images && service.images.length > 0) && (
                                                            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-border/50 relative shadow-xs">
                                                                <Image 
                                                                    src={service.images[0] || getServiceLocalImage(service.name, service.images) || '/services/corte-de-cabello.webp'}
                                                                    alt={service.name} 
                                                                    fill
                                                                    className="object-cover" 
                                                                    unoptimized
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-sm sm:text-base text-foreground leading-snug">{service.name}</h3>
                                                            <div className="flex flex-col gap-1 mt-0.5">
                                                                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                                                    <span className="font-sans font-bold text-foreground">{formatPrice(service.price)}</span>
                                                                    <span>•</span>
                                                                    <span>{service.duration} min</span>
                                                                </div>
                                                                {service.payment_type === 'online-deposit' && (
                                                                    <span className="text-[11px] text-[#C5A880] font-semibold bg-[#C5A880]/10 border border-[#C5A880]/30 px-2 py-0.5 rounded-md w-fit">
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
                                                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                                            {count > 0 && (
                                                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-border/50">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer" onClick={() => removeFromCart(service.id)}>
                                                                        {count === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                                                    </Button>
                                                                    <span className="font-bold font-sans w-4 text-center text-sm">{count}</span>
                                                                </div>
                                                            )}
                                                            <Button
                                                                variant={count > 0 ? "default" : "outline"}
                                                                size="icon"
                                                                className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-xl cursor-pointer transition-all", count > 0 ? "bg-[#202A49] hover:bg-[#18223c] text-white shadow-sm" : "border-border hover:border-blue-500 hover:bg-blue-500/10")}
                                                                onClick={() => addToCart(service)}
                                                            >
                                                                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>

                                    {/* PRODUCTS SECTION */}
                                    <h2 id="productos" className="text-xl font-bold tracking-tight text-foreground mb-3 mt-8 pt-4 border-t border-border/60 scroll-mt-24">Selecciona tus productos</h2>
                                    <div className="grid grid-cols-1 gap-3.5 sm:gap-4 mb-4">
                                        {productsData && productsData.length > 0 ? (
                                            productsData.filter((p: any) => p.active && (p.stock > 0 || p.stock === undefined) && p.visible_en_web !== false).map((product: any) => {
                                                const count = getProductCount(product.id);
                                                return (
                                                    <Card key={product.id} className={cn("rounded-2xl border transition-all duration-200 hover:shadow-md", count > 0 ? "border-blue-500 bg-blue-500/5 shadow-xs" : "border-border/70 hover:border-blue-500/50")}>
                                                        <CardContent className="p-3.5 sm:p-4 flex items-center gap-3.5 sm:gap-4">
                                                            {(product.images && product.images.length > 0) ? (
                                                                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-border/50 relative shadow-xs">
                                                                    <Image 
                                                                        src={product.images[0]} 
                                                                        alt={product.nombre} 
                                                                        fill 
                                                                        className="object-cover" 
                                                                        unoptimized
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-border/50 text-muted-foreground">
                                                                    <ShoppingBag className="h-6 w-6" />
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-bold text-sm sm:text-base text-foreground leading-snug">{product.nombre}</h3>
                                                                <div className="flex flex-col gap-1 mt-0.5">
                                                                    <div className="text-xs sm:text-sm text-muted-foreground">
                                                                        <span className="font-sans font-bold text-foreground">{formatPrice(product.public_price)}</span>
                                                                    </div>
                                                                    {product.payment_type === 'deposit' && (
                                                                        <span className="text-[11px] text-[#C5A880] font-semibold bg-[#C5A880]/10 border border-[#C5A880]/30 px-2 py-0.5 rounded-md w-fit">
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
                                                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                                                {count > 0 && (
                                                                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-border/50">
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer" onClick={() => removeFromProductCart(product.id)}>
                                                                            <Minus className="h-4 w-4" />
                                                                        </Button>
                                                                        <span className="font-bold font-sans w-4 text-center text-sm">{count}</span>
                                                                    </div>
                                                                )}
                                                                <Button
                                                                    variant={count > 0 ? "default" : "outline"}
                                                                    size="icon"
                                                                    className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-xl cursor-pointer transition-all", count > 0 ? "bg-[#202A49] hover:bg-[#18223c] text-white shadow-sm" : "border-border hover:border-blue-500 hover:bg-blue-500/10")}
                                                                    onClick={() => addToProductCart(product)}
                                                                >
                                                                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
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

                                {/* PROMOTIONS SECTION */}
                                {activePromotions.length > 0 && (
                                    <>
                                        <h2 id="promociones" className="text-xl font-bold tracking-tight text-foreground mb-3 mt-8 pt-4 border-t border-border/60 scroll-mt-24">Promociones Activas</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            {activePromotions.map((promo: any) => (
                                                <Card key={promo.id} className="overflow-hidden border-2 border-blue-500/20 hover:border-blue-500/60 shadow-xs hover:shadow-md transition-all rounded-2xl bg-card">
                                                    <div className="flex h-full flex-col sm:flex-row">
                                                        <div className="w-full sm:w-1/3 bg-slate-100 dark:bg-slate-800 relative min-h-[120px]">
                                                            {promo.imageUrl ? (
                                                                <Image 
                                                                    src={promo.imageUrl} 
                                                                    alt={promo.name} 
                                                                    fill
                                                                    className="object-cover" 
                                                                    sizes="(max-width: 640px) 100vw, 33vw"
                                                                />
                                                            ) : (
                                                                <div className="h-full w-full flex items-center justify-center text-muted-foreground p-4">
                                                                    <ShoppingBag className="h-8 w-8 opacity-20" />
                                                                </div>
                                                            )}
                                                            <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shadow-xs">
                                                                OFERTA
                                                            </div>
                                                        </div>
                                                        <CardContent className="flex-1 p-4 flex flex-col justify-between">
                                                            <div>
                                                                <h3 className="font-bold text-base mb-1 text-foreground">{promo.name}</h3>
                                                                <div className="flex items-center text-xs text-muted-foreground mb-2">
                                                                    <Clock className="w-3.5 h-3.5 mr-1 text-blue-400" />
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
                                                                                return `Hasta el ${format(end, "d 'de' MMM", { locale: es })}`;
                                                                            } else if (end) {
                                                                                return `Válido hasta: ${format(end, "d 'de' MMM", { locale: es })}`;
                                                                            }
                                                                            return 'Tiempo limitado';
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
                                                                    {promo.description}
                                                                </p>
                                                            </div>

                                                            {promo.termsAndConditions && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedPromotion(promo);
                                                                    }}
                                                                    className="text-xs text-blue-500 hover:text-blue-400 font-semibold underline underline-offset-4 w-fit cursor-pointer"
                                                                >
                                                                    Ver términos y condiciones
                                                                </button>
                                                            )}
                                                        </CardContent>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* BARRA FLOTANTE INFERIOR OFICIAL CON EFECTO LÁSER */}
                                <div className="fixed bottom-0 left-0 w-full px-4 sm:px-6 py-3 sm:py-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white border-t-2 border-blue-500/60 flex justify-between items-center shadow-[0_-10px_35px_rgba(0,0,0,0.6)] z-50 animate-in slide-in-from-bottom-5 overflow-hidden">
                                    <div className="header-light-beam pointer-events-none" aria-hidden="true" />
                                    <div className="relative z-10">
                                        <p className="text-xs text-slate-300 font-medium">
                                            {cart.length > 0 ? `${cart.length} servicio${cart.length !== 1 ? 's' : ''}` : ''}
                                            {cart.length > 0 && productCart.length > 0 ? ', ' : ''}
                                            {productCart.length > 0 ? `${productCart.length} producto${productCart.length !== 1 ? 's' : ''}` : ''}
                                            {cart.length === 0 && productCart.length === 0 ? 'Nada seleccionado' : ''}
                                        </p>
                                        <p className="font-sans font-black text-lg sm:text-xl text-white tracking-tight">{formatPrice(totalPrice)}</p>
                                    </div>
                                    <div className="relative z-10">
                                        <Button
                                            variant="alfa"
                                            size="lg"
                                            onClick={handleServicesConfirmed}
                                            disabled={cart.length === 0}
                                            className="shadow-[0_4px_20px_rgba(32,42,73,0.8)] px-5 sm:px-7 h-11 text-sm sm:text-base font-bold rounded-xl cursor-pointer"
                                        >
                                            <span>Continuar</span>
                                            <ChevronRight className="ml-1.5 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Floating Navigation Menu (Radial) */}
                                <div className="fixed bottom-24 right-4 sm:right-8 z-40">
                                    <div className="relative">
                                        {/* Action Buttons (Radial) */}
                                        <AnimatePresence>
                                            {isMenuOpen && (
                                                <div className="absolute bottom-full right-0 mb-4 flex flex-col items-end gap-4">
                                                    {[
                                                        { id: 'promociones', icon: Sparkles, label: 'Promos', show: activePromotions.length > 0 },
                                                        { id: 'productos', icon: ShoppingBag, label: 'Productos', show: true },
                                                        { id: 'paquetes', icon: Layers, label: 'Paquetes', show: visiblePackageServices.length > 0 },
                                                        { id: 'servicios', icon: Scissors, label: 'Servicios', show: true },
                                                    ].filter(item => item.show).map((item, index) => (
                                                        <motion.div
                                                            key={item.id}
                                                            initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 20, scale: 0.8 }}
                                                            transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 20 }}
                                                            className="flex items-center group"
                                                        >
                                                            <span className="absolute right-full mr-3 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none">
                                                                {item.label}
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    scrollToSection(item.id);
                                                                    setIsMenuOpen(false);
                                                                }}
                                                                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border border-blue-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:border-blue-500/60 hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all"
                                                            >
                                                                <item.icon className="w-5 h-5 text-blue-400" />
                                                            </button>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            )}
                                        </AnimatePresence>

                                        {/* Main Toggle Button */}
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                                            className={cn(
                                                "w-14 h-14 rounded-full bg-black flex items-center justify-center border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.4)] z-50 transition-all duration-300",
                                                isMenuOpen ? "rotate-45" : "rotate-0"
                                            )}
                                        >
                                            <AnimatePresence mode="wait">
                                                {isMenuOpen ? (
                                                    <motion.div
                                                        key="close"
                                                        initial={{ opacity: 0, rotate: -90 }}
                                                        animate={{ opacity: 1, rotate: 0 }}
                                                        exit={{ opacity: 0, rotate: 90 }}
                                                    >
                                                        <X className="w-7 h-7 text-white" />
                                                    </motion.div>
                                                ) : (
                                                    <motion.div
                                                        key="menu"
                                                        initial={{ opacity: 0, rotate: 90 }}
                                                        animate={{ opacity: 1, rotate: 0 }}
                                                        exit={{ opacity: 0, rotate: -90 }}
                                                        className="relative w-10 h-10 flex items-center justify-center"
                                                    >
                                                        <Image 
                                                            src="/icono-pagina-web.webp" 
                                                            alt="Vatos Alfa" 
                                                            fill
                                                            className="rounded-full object-cover border border-white/10"
                                                            sizes="40px"
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                            
                                            {/* Pulse effect when closed */}
                                            {!isMenuOpen && (
                                                <span className="absolute inset-0 rounded-full border-2 border-blue-500/50 animate-ping" />
                                            )}
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 1: MODE SELECTION */}
                        {step === 1 && (
                            <motion.div key="step1" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <button 
                                    onClick={() => setStep(0)} 
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-foreground transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 mb-2 -ml-1 cursor-pointer"
                                >
                                    <ChevronLeft className="h-4 w-4" /> Volver
                                </button>
                                <h2 className="text-xl sm:text-2xl font-black text-center mb-6 tracking-tight text-foreground">¿Cómo quieres agendar?</h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div
                                        className="border-2 border-border/80 hover:border-blue-500 rounded-2xl p-6 sm:p-8 cursor-pointer hover:bg-blue-500/5 hover:shadow-[0_10px_30px_rgba(59,130,246,0.18)] transition-all flex flex-col items-center text-center gap-4 bg-card group"
                                        onClick={() => handleModeSelection('combined')}
                                    >
                                        <Layers className="h-12 w-12 text-blue-400 group-hover:scale-110 transition-transform" />
                                        <div>
                                            <h3 className="font-bold text-lg text-foreground">Uno tras otro</h3>
                                            <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                                                Para una sola persona. Todos los servicios se realizan seguidos en una sola cita.
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        className="border-2 border-border/80 hover:border-blue-500 rounded-2xl p-6 sm:p-8 cursor-pointer hover:bg-blue-500/5 hover:shadow-[0_10px_30px_rgba(59,130,246,0.18)] transition-all flex flex-col items-center text-center gap-4 bg-card group"
                                        onClick={() => handleModeSelection('individual')}
                                    >
                                        <CalendarDays className="h-12 w-12 text-blue-400 group-hover:scale-110 transition-transform" />
                                        <div>
                                            <h3 className="font-bold text-lg text-foreground">Por separado</h3>
                                            <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
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
                                <button 
                                    onClick={() => setStep(cart.length > 1 ? 1 : 0)} 
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-foreground transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 mb-2 -ml-1 cursor-pointer"
                                >
                                    <ChevronLeft className="h-4 w-4" /> Volver
                                </button>
                                <h2 className="text-xl font-bold tracking-tight text-foreground mb-1">Configura tus citas</h2>
                                <p className="text-xs sm:text-sm text-muted-foreground mb-4">Selecciona cada servicio para asignar fecha, hora y profesional.</p>

                                <div className="space-y-3">
                                    {cart.map((item, idx) => {
                                        const cfg = configs[item.uniqueId];
                                        return (
                                            <Card
                                                key={item.uniqueId}
                                                className={cn("cursor-pointer border-2 transition-all rounded-xl", cfg ? "bg-blue-500/5 border-blue-500/50 shadow-xs" : "border-dashed border-border/80 hover:border-blue-500/60")}
                                                onClick={() => startConfiguration(item.uniqueId)}
                                            >
                                                <CardContent className="p-4 flex items-center justify-between">
                                                    <div>
                                                        <div className="font-bold text-sm sm:text-base flex items-center gap-2">
                                                            <span className="bg-slate-200 dark:bg-slate-800 text-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{idx + 1}</span>
                                                            {item.service.name}
                                                        </div>
                                                        {cfg ? (
                                                            <div className="text-xs sm:text-sm text-blue-500 mt-1 flex flex-col sm:flex-row sm:gap-3 font-medium">
                                                                <span className="capitalize">{format(cfg.date, 'EEE d, MMM', { locale: es })} - {cfg.time}</span>
                                                                <span className="flex items-center gap-1"><User className="h-3 w-3" /> {cfg.professional.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground font-medium mt-1 block">Pendiente de agendar</span>
                                                        )}
                                                    </div>
                                                    <div className="ml-2">
                                                        {cfg ? <Edit2 className="h-4 w-4 text-blue-500" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>

                                <div className="mt-8 flex justify-end">
                                    <Button 
                                        variant="alfa" 
                                        onClick={() => setStep(3)} 
                                        disabled={!isDashboardComplete} 
                                        size="lg" 
                                        className="w-full sm:w-auto px-8 h-11 font-bold rounded-xl shadow-[0_4px_20px_rgba(32,42,73,0.8)] cursor-pointer"
                                    >
                                        Siguiente <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* SUB-FLOW: DATE / TIME / PRO */}
                        {step === 2 && activeConfigId && (
                            <motion.div key="subflow" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col min-h-[400px]">
                                <div className="flex items-center mb-4">
                                    <button 
                                        onClick={() => {
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
                                        }} 
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-foreground transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 -ml-1 mr-2 cursor-pointer"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        <span>Volver</span>
                                    </button>
                                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                                        {activeConfigId === 'combined' ? 'Elige fecha y hora' : cart.find(c => c.uniqueId === activeConfigId)?.service.name}
                                    </h2>
                                </div>

                                {/* SCENARIO 1: PICK DATE */}
                                {configStep === 0 && (
                                    <div className="flex flex-col items-center animate-in fade-in-50 duration-200">
                                        <div className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden bg-white dark:bg-slate-900 mb-3 w-full max-w-[340px]">
                                            {/* Header del Calendario Estilo Agenda */}
                                            <div className="bg-slate-50 dark:bg-slate-850/80 px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <CalendarDays className="h-4 w-4 text-blue-500" />
                                                    <span className="text-xs sm:text-sm font-bold text-foreground">Elige una fecha</span>
                                                </div>
                                                <span className="text-[11px] font-semibold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-md">
                                                    {tempDate ? format(tempDate, "d 'de' MMM", { locale: es }) : 'Pendiente'}
                                                </span>
                                            </div>

                                            <Calendar
                                                mode="single"
                                                selected={tempDate}
                                                onSelect={(d) => {
                                                    setTempDate(d);
                                                    if (d) setConfigStep(1);
                                                }}
                                                disabled={(date) => 
                                                    isBefore(date, startOfToday()) || 
                                                    isAfter(date, addDays(startOfToday(), Number(serviciosConfig?.dias_maximos_futuro) || 14))
                                                }
                                                className="p-3 mx-auto"
                                                locale={es}
                                            />

                                            {/* Accesos rápidos como en la agenda */}
                                            <div className="p-2 border-t border-border/60 flex items-center gap-2 bg-slate-50/80 dark:bg-slate-850/60">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs font-semibold text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg flex-1 cursor-pointer transition-colors"
                                                    onClick={() => {
                                                        const today = startOfToday();
                                                        setTempDate(today);
                                                        setConfigStep(1);
                                                    }}
                                                >
                                                    Hoy
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs font-semibold text-slate-400 hover:text-foreground hover:bg-muted/40 rounded-lg flex-1 cursor-pointer transition-colors"
                                                    onClick={() => {
                                                        const tomorrow = addDays(startOfToday(), 1);
                                                        setTempDate(tomorrow);
                                                        setConfigStep(1);
                                                    }}
                                                >
                                                    Mañana
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground font-medium text-center">Selecciona un día en el calendario o pulsa un acceso rápido para ver horarios disponibles.</p>
                                    </div>
                                )}

                                {/* SCENARIO 2: PICK TIME */}
                                {configStep === 1 && (
                                    <div className="flex flex-col h-full">
                                        <h3 className="font-bold text-base sm:text-lg mb-4 capitalize text-center border-b border-border/60 pb-3 text-foreground">
                                            {tempDate ? format(tempDate, 'EEEE d, MMMM', { locale: es }) : ''}
                                        </h3>

                                        {loadingSlots ? (
                                            <div className="grid grid-cols-3 gap-3 p-1 w-full animate-pulse">
                                                {[...Array(9)].map((_, i) => (
                                                    <div key={i} className="h-11 w-full bg-slate-100 dark:bg-slate-800 rounded-xl border border-border/50"></div>
                                                ))}
                                            </div>
                                        ) : noCapablePros ? (
                                            <div className="text-center p-8 border border-dashed rounded-2xl bg-muted/20 border-border/60">
                                                <Users className="h-10 w-10 text-blue-400 mx-auto mb-2" />
                                                <p className="text-foreground font-semibold mb-1">Combinación no disponible</p>
                                                <p className="text-xs sm:text-sm text-muted-foreground mb-4">Ningún profesional disponible realiza todos estos servicios.</p>
                                                <div className="flex flex-col gap-2">
                                                    <Button variant="outline" className="rounded-xl font-bold cursor-pointer" onClick={() => setConfigStep(0)}>Cambiar Fecha</Button>
                                                    {bookingMode === 'combined' && (
                                                        <p className="text-xs text-muted-foreground mt-2">Intenta la opción <span className="font-bold">"Por separado"</span> para asignar diferentes profesionales.</p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : tempAvailableSlots.length === 0 ? (
                                            <div className="text-center p-8 border border-dashed rounded-2xl bg-muted/10 border-border/60">
                                                <p className="text-muted-foreground text-sm">No hay horarios disponibles para esta fecha.</p>
                                                <Button variant="link" className="text-blue-500 font-semibold cursor-pointer mt-2" onClick={() => setConfigStep(0)}>Cambiar Fecha</Button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3 overflow-y-auto max-h-[320px] p-1">
                                                {tempAvailableSlots.map(time => (
                                                    <Button 
                                                        key={time} 
                                                        variant="outline" 
                                                        className="h-11 rounded-xl font-sans font-bold text-sm border-border/80 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer"
                                                        onClick={() => handleTimeSelected(time)}
                                                    >
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
                                            <p className="text-lg sm:text-xl font-black font-sans text-foreground">{tempTime} hrs</p>
                                            <p className="text-xs sm:text-sm text-muted-foreground font-medium">¿Con quién te gustaría atenderte?</p>
                                        </div>

                                        <div className="flex-1 pr-1">
                                            <div className="grid grid-cols-3 gap-3">
                                                {/* OPTION: ANY PRO */}
                                                <div
                                                    className="flex flex-col items-center p-3 rounded-2xl border-2 cursor-pointer border-dashed border-border/80 hover:border-blue-500 hover:bg-blue-500/5 transition-all group"
                                                    onClick={() => {
                                                        const availableParams = tempSlotMap[tempTime || ''];
                                                        if (availableParams && availableParams.length > 0) {
                                                            // Auto-select the first one
                                                            handleProSelected(availableParams[0]);
                                                        }
                                                    }}
                                                >
                                                    <div className="w-full aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2 border border-border/50 overflow-hidden relative shadow-xs">
                                                        {empresaData?.[0]?.icon_url ? (
                                                            <Image 
                                                                src={empresaData[0].icon_url} 
                                                                alt="Icon" 
                                                                fill
                                                                className="object-cover" 
                                                                unoptimized
                                                            />
                                                        ) : empresaData?.[0]?.logo_url ? (
                                                            <Image 
                                                                src={empresaData[0].logo_url} 
                                                                alt="Logo" 
                                                                fill
                                                                className="object-cover" 
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <Users className="h-8 w-8 text-blue-400" />
                                                        )}
                                                    </div>
                                                    <h3 className="font-bold text-xs text-center leading-tight text-foreground">Primero disponible</h3>
                                                    <p className="text-[10px] text-muted-foreground text-center line-clamp-1">Automático</p>
                                                </div>

                                                {/* FILTER PROS available at this time */}
                                                {tempSlotMap[tempTime || '']?.map((proId: string) => {
                                                    const pro = professionals.find(p => p.id === proId);
                                                    if (!pro) return null;
                                                    return (
                                                        <div
                                                            key={pro.id}
                                                            className="flex flex-col items-center p-3 rounded-2xl border-2 border-border/70 cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-all group"
                                                            onClick={() => handleProSelected(pro.id)}
                                                        >
                                                            <div className="w-full aspect-square rounded-xl bg-muted overflow-hidden mb-2 border border-border/50 relative shadow-xs">
                                                                {pro.avatarUrl ? (
                                                                    <Image 
                                                                        src={pro.avatarUrl} 
                                                                        alt={pro.publicName || pro.name} 
                                                                        fill
                                                                        className="object-cover" 
                                                                        unoptimized
                                                                    />
                                                                ) : (
                                                                    <User className="w-full h-full p-3 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                            <h3 className="font-bold text-xs text-center leading-tight text-foreground">{pro.publicName || pro.name}</h3>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}


                        {/* STEP 3: TUS DATOS */}
                        {step === 3 && (
                            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                <div className="border-b border-border/60 pb-3">
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">Tus Datos de Contacto</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Ingresa tus datos para registrar y confirmar tu cita</p>
                                </div>

                                {/* FORMULARIO DE DATOS COMPACTO CON LABELS EN LÍNEA (DELANTE) */}
                                <div className="bg-slate-50/70 dark:bg-slate-850/40 p-4 sm:p-5 rounded-2xl border border-border/80 space-y-3">
                                    {/* Fila 1: Nombre y Apellido */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="name" className="w-16 sm:w-20 text-xs font-semibold text-foreground/80 shrink-0">
                                                Nombre <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                id="name"
                                                placeholder="Juan"
                                                value={clientDetails.name}
                                                onChange={(e) => setClientDetails({ ...clientDetails, name: correctName(e.target.value) })}
                                                className="flex-1 rounded-xl border-border/80 focus-visible:ring-blue-500 h-9 text-xs sm:text-sm bg-background"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="lastname" className="w-16 sm:w-20 text-xs font-semibold text-foreground/80 shrink-0">
                                                Apellido <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                id="lastname"
                                                placeholder="Pérez"
                                                value={clientDetails.lastName}
                                                onChange={(e) => setClientDetails({ ...clientDetails, lastName: correctName(e.target.value) })}
                                                className="flex-1 rounded-xl border-border/80 focus-visible:ring-blue-500 h-9 text-xs sm:text-sm bg-background"
                                            />
                                        </div>
                                    </div>

                                    {/* Fila 2: Celular y Email */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                        {/* Celular */}
                                        {getFieldConfig('phone').use && (
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="phone" className="w-16 sm:w-20 text-xs font-semibold text-foreground/80 shrink-0">
                                                    Celular {getFieldConfig('phone').required && <span className="text-red-500">*</span>}
                                                </Label>
                                                <div className="flex-1">
                                                    <Input
                                                        id="phone"
                                                        type="tel"
                                                        placeholder="5512345678"
                                                        value={clientDetails.phone}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                            setClientDetails({ ...clientDetails, phone: val });
                                                        }}
                                                        className={cn(
                                                            "w-full rounded-xl border-border/80 focus-visible:ring-blue-500 h-9 text-xs sm:text-sm bg-background",
                                                            (clientDetails.phone.length > 0 && clientDetails.phone.length < 10) || (clientDetails.phone.length === 10 && /^(\d)\1{9}$/.test(clientDetails.phone))
                                                                ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                                                                : ""
                                                        )}
                                                    />
                                                    {clientDetails.phone.length === 10 && /^(\d)\1{9}$/.test(clientDetails.phone) && (
                                                        <p className="text-[10px] text-red-500 mt-0.5">Número inválido.</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Email */}
                                        {getFieldConfig('email').use && (
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="email" className="w-16 sm:w-20 text-xs font-semibold text-foreground/80 shrink-0">
                                                    Email {getFieldConfig('email').required && <span className="text-red-500">*</span>}
                                                </Label>
                                                <div className="flex-1">
                                                    <Input
                                                        id="email"
                                                        type="email"
                                                        placeholder="tu@email.com"
                                                        value={clientDetails.email}
                                                        onChange={(e) => setClientDetails({ ...clientDetails, email: e.target.value })}
                                                        className={cn(
                                                            "w-full rounded-xl border-border/80 focus-visible:ring-blue-500 h-9 text-xs sm:text-sm bg-background",
                                                            clientDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientDetails.email)
                                                                ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                                                                : ""
                                                        )}
                                                    />
                                                    {clientDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientDetails.email) && (
                                                        <p className="text-[10px] text-red-500 mt-0.5">Formato de email incorrecto.</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Fila 3: Dirección y Notas (si aplican) */}
                                    {(getFieldConfig('address').use || getFieldConfig('notes').use) && (
                                        <div className={cn(
                                            "grid gap-2.5 sm:gap-3",
                                            getFieldConfig('address').use && getFieldConfig('notes').use ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                                        )}>
                                            {/* Dirección */}
                                            {getFieldConfig('address').use && (
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor="address" className="w-16 sm:w-20 text-xs font-semibold text-foreground/80 shrink-0">
                                                        Dirección {getFieldConfig('address').required && <span className="text-red-500">*</span>}
                                                    </Label>
                                                    <Input
                                                        id="address"
                                                        placeholder="Calle 123..."
                                                        value={clientDetails.address}
                                                        onChange={(e) => setClientDetails({ ...clientDetails, address: e.target.value })}
                                                        className="flex-1 rounded-xl border-border/80 focus-visible:ring-blue-500 h-9 text-xs sm:text-sm bg-background"
                                                    />
                                                </div>
                                            )}

                                            {/* Notas */}
                                            {getFieldConfig('notes').use && (
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor="notes" className="w-16 sm:w-20 text-xs font-semibold text-foreground/80 shrink-0">
                                                        Notas {getFieldConfig('notes').required && <span className="text-red-500">*</span>}
                                                    </Label>
                                                    <Input
                                                        id="notes"
                                                        placeholder="Preferencias..."
                                                        value={clientDetails.notes}
                                                        onChange={(e) => setClientDetails({ ...clientDetails, notes: e.target.value })}
                                                        className="flex-1 rounded-xl border-border/80 focus-visible:ring-blue-500 h-9 text-xs sm:text-sm bg-background"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Cumpleaños */}
                                    {getFieldConfig('dob').use && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                                            <Label className="w-full sm:w-24 text-xs font-semibold text-foreground/80 shrink-0">
                                                Cumpleaños 🎁 {getFieldConfig('dob').required && <span className="text-red-500">*</span>}
                                            </Label>
                                            <div className="grid grid-cols-3 gap-2 flex-1">
                                                <Select value={bDay} onValueChange={(v) => updateBirthday('day', v)}>
                                                    <SelectTrigger className="rounded-xl border-border/80 h-9 text-xs sm:text-sm bg-background"><SelectValue placeholder="Día" /></SelectTrigger>
                                                    <SelectContent className="rounded-xl border-2 border-blue-500">
                                                        {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>

                                                <Select value={bMonth} onValueChange={(v) => updateBirthday('month', v)}>
                                                    <SelectTrigger className="rounded-xl border-border/80 h-9 text-xs sm:text-sm bg-background"><SelectValue placeholder="Mes" /></SelectTrigger>
                                                    <SelectContent className="rounded-xl border-2 border-blue-500">
                                                        {months.map(m => <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>

                                                <Select value={bYear} onValueChange={(v) => updateBirthday('year', v)}>
                                                    <SelectTrigger className="rounded-xl border-border/80 h-9 text-xs sm:text-sm bg-background"><SelectValue placeholder="Año" /></SelectTrigger>
                                                    <SelectContent className="rounded-xl border-2 border-blue-500">
                                                        {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* BOTÓN OFICIAL VATOS ALFA DENTRO DE LA TARJETA BLANCA: CONTINUAR AL RESUMEN */}
                                <div className="mt-8 mb-6 flex justify-center animate-in slide-in-from-bottom-3">
                                    <div className="w-full max-w-md">
                                        <Button
                                            variant="alfa"
                                            className="w-full shadow-[0_10px_30px_rgba(32,42,73,0.3),0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_14px_35px_rgba(32,42,73,0.4)] h-12 text-base font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
                                            onClick={() => setStep(4)}
                                            disabled={!isStep3Valid}
                                        >
                                            <span>Continuar al Resumen</span>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 4: RESUMEN Y PAGO */}
                        {step === 4 && (
                            <motion.div key="step4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                <div className="border-b border-border/60 pb-3">
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">Resumen de tu Cita</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Revisa todos los detalles antes de confirmar tu reserva</p>
                                </div>

                                {/* TARJETA DE DETALLES DE CITA Y CONTACTO */}
                                <div className="bg-slate-50/80 dark:bg-slate-850/50 p-3.5 sm:p-4 rounded-2xl border border-border/80 shadow-xs space-y-2">
                                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="h-4 w-4 text-blue-500" />
                                            <h3 className="font-bold text-sm sm:text-base text-foreground">Detalles de la Cita</h3>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setStep(3)}
                                            className="text-xs font-semibold text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-blue-500/10"
                                            title="Editar tus datos"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                            <span>Editar datos</span>
                                        </button>
                                    </div>

                                    {/* Cliente */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                        <span className="font-bold text-foreground">{clientDetails.name} {clientDetails.lastName}</span>
                                        {clientDetails.phone && (
                                            <span className="text-muted-foreground flex items-center gap-1">
                                                <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                                <span>{clientDetails.phone}</span>
                                            </span>
                                        )}
                                        {clientDetails.email && (
                                            <span className="text-muted-foreground flex items-center gap-1">
                                                <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                                <span>{clientDetails.email}</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Horarios y Profesionales */}
                                    <div className="space-y-2 pt-1 border-t border-border/40">
                                        {bookingMode === 'combined' || cart.length === 1 ? (
                                            (() => {
                                                const cfg = configs['combined'] || configs[cart[0]?.uniqueId];
                                                if (!cfg) return null;
                                                const rawDate = format(cfg.date, "EEEE d 'de' MMMM", { locale: es });
                                                const formattedDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
                                                return (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-border/60">
                                                        <div className="flex items-center gap-2.5">
                                                            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                                                            <div>
                                                                <p className="text-xs font-bold text-foreground">
                                                                    {formattedDate} a las {cfg.time} hrs
                                                                </p>
                                                                <p className="text-[11px] text-muted-foreground">
                                                                    Duración estimada: {totalDuration} min
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-xs text-foreground font-medium sm:self-center">
                                                            <User className="h-3.5 w-3.5 text-slate-400" />
                                                            <span>{cfg.professional?.name || 'Profesional asignado'}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            cart.map((item, idx) => {
                                                const cfg = configs[item.uniqueId];
                                                if (!cfg) return null;
                                                return (
                                                    <div key={item.uniqueId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-border/60 text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <span className="bg-slate-200 dark:bg-slate-800 text-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{idx + 1}</span>
                                                            <span className="font-semibold text-foreground">{item.service.name}</span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-[11px]">
                                                            <span className="capitalize">{format(cfg.date, 'EEE d, MMM', { locale: es })} - {cfg.time}</span>
                                                            <span className="flex items-center gap-1"><User className="h-3 w-3 text-slate-400" /> {cfg.professional?.name}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* RESUMEN DE COMPRA INTEGRADO Y MINIMALISTA */}
                                <div className="bg-slate-50/80 dark:bg-slate-850/50 p-3.5 sm:p-4 rounded-2xl border border-border/80 shadow-xs space-y-2">
                                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-sm sm:text-base text-foreground">Resumen de Compra</h3>
                                            <span className="text-xs font-normal text-muted-foreground font-sans">
                                                ({cart.length + productCart.length} {cart.length + productCart.length === 1 ? 'ítem' : 'ítems'})
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setStep(0)}
                                            className="text-xs font-semibold text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-blue-500/10"
                                            title="Agregar más servicios o productos a tu compra"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            <span>Agregar más</span>
                                        </button>
                                    </div>

                                    <div className="max-h-48 overflow-y-auto pr-1 custom-scrollbar divide-y divide-border/20">
                                        {/* Servicios */}
                                        {cart.map((item) => (
                                            <div key={item.uniqueId} className="flex items-center justify-between text-xs py-1 first:pt-0">
                                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0 leading-none">
                                                        Servicio
                                                    </span>
                                                    <span className="truncate font-medium text-foreground text-xs">{item.service.name}</span>
                                                </div>
                                                <span className="font-sans font-semibold text-foreground text-xs shrink-0">{formatPrice(item.service.price)}</span>
                                            </div>
                                        ))}

                                        {/* Productos integrados con opción de eliminar */}
                                        {productCart.map((product) => (
                                            <div key={product.id} className="flex items-center justify-between text-xs py-1 group">
                                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20 shrink-0 leading-none">
                                                        Producto
                                                    </span>
                                                    <span className="truncate font-medium text-foreground text-xs">{product.nombre}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setProductCart(prev => prev.filter(p => p.id !== product.id))}
                                                        className="text-slate-400 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                                                        title="Quitar producto"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                                <span className="font-sans font-semibold text-foreground text-xs shrink-0">{formatPrice(product.public_price)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Enlace sutil para agregar más */}
                                    <div className="pt-0.5 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setStep(0)}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:text-blue-400 hover:underline transition-colors cursor-pointer"
                                        >
                                            <Plus className="h-3 w-3" />
                                            <span>¿Deseas agregar otro servicio o producto?</span>
                                        </button>
                                    </div>

                                    <div className="border-t border-border/60 pt-2 space-y-1">
                                        <div className="flex justify-between text-base sm:text-lg font-bold text-foreground">
                                            <span>Total</span>
                                            <span className="font-sans font-black">{formatPrice(totalPrice)}</span>
                                        </div>
                                        {upfrontTotal > 0 && (
                                            <>
                                                <div className="flex justify-between text-xs sm:text-sm font-bold text-blue-500">
                                                    <span>Pagar ahora en línea (Anticipo)</span>
                                                    <span className="font-sans">{formatPrice(upfrontTotal)}</span>
                                                </div>
                                                <div className="flex justify-between text-[11px] sm:text-xs text-muted-foreground">
                                                    <span>Pendiente en local</span>
                                                    <span className="font-sans font-medium">{formatPrice(totalPrice - upfrontTotal)}</span>
                                                </div>
                                                {historyRequiresDeposit && (
                                                    <div className="bg-red-500/10 border border-red-500/30 text-red-900 dark:text-red-300 text-xs p-3 rounded-xl flex items-start gap-2 mt-2">
                                                        <ShieldCheck className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                                                        <div className="space-y-0.5">
                                                            <p className="font-bold text-red-800 dark:text-red-200 text-xs">
                                                                Anticipo obligatorio por inasistencias ({historyPenaltyPercent}%)
                                                            </p>
                                                            <p className="text-[11px] text-red-700 dark:text-red-300 leading-tight">
                                                                Tu cuenta registra inasistencias previas. Para confirmar tu reserva, se requiere un anticipo de garantía del {historyPenaltyPercent}%.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                                {!historyRequiresDeposit && sameDayRequiresDeposit && (
                                                    <div className="bg-blue-500/10 border border-blue-500/30 text-foreground text-xs p-2.5 rounded-xl flex items-start gap-2 mt-2">
                                                        <ShieldCheck className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                                                        <div className="space-y-0.5">
                                                            <p className="font-bold text-blue-400 text-xs">
                                                                Escudo de Reserva: Cita activa para la misma fecha
                                                            </p>
                                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                                {sameDayDepositMessage || `Detectamos que ya cuentas con una cita programada para esta fecha ($${sameDayActiveTotal.toFixed(2)} MXN). Al sumar esta reserva y alcanzar $${sameDayAccumulatedTotal.toFixed(2)} MXN en el día, se requiere un anticipo del ${sameDayDepositPercent}% de garantía.`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                                {!historyRequiresDeposit && !sameDayRequiresDeposit && isThresholdDepositApplied && (
                                                    <div className="bg-blue-500/10 border border-blue-500/30 text-foreground text-xs p-2.5 rounded-xl flex items-start gap-2 mt-1.5">
                                                        <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                                                        <span className="text-muted-foreground text-[11px] leading-relaxed">Por el monto de los servicios (${totalPrice.toFixed(2)}), se requiere un anticipo del {serviciosConfig?.anticipo_porcentaje_defecto || 50}% para confirmar tu espacio.</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* BOTÓN OFICIAL VATOS ALFA DENTRO DE LA TARJETA BLANCA */}
                                <div className="mt-8 mb-6 flex justify-center animate-in slide-in-from-bottom-3">
                                    <div className="w-full max-w-md">
                                        <Button
                                            variant="alfa"
                                            className="w-full shadow-[0_10px_30px_rgba(32,42,73,0.3),0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_14px_35px_rgba(32,42,73,0.4)] h-12 text-base font-bold rounded-xl cursor-pointer transition-all"
                                            onClick={confirmBooking}
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                <div className="flex items-center gap-2 justify-center">
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    <span>Procesando...</span>
                                                </div>
                                            ) : (upfrontTotal > 0 ? "Proceder al Pago" : "Confirmar Reserva")}
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 5: SUCCESS */}
                        {step === 5 && (
                            <motion.div key="step5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center space-y-4 max-w-md mx-auto">
                                <CheckCircle className="w-16 h-16 text-blue-400 mb-2 animate-in zoom-in duration-300" />
                                <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">¡Reserva Confirmada!</h2>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    Gracias <strong className="text-foreground">{clientDetails.name}</strong>, tus citas han sido agendadas con éxito.
                                </p>
                                {websiteSettings.predefinedNotes && (
                                    <div className="bg-muted/40 border border-border/80 text-foreground p-4 rounded-2xl mt-4 text-xs sm:text-sm shadow-xs whitespace-pre-line text-left w-full">
                                        {websiteSettings.predefinedNotes.replace('3 horas antes. ', '3 horas antes.\n')}
                                    </div>
                                )}
                                {isSandboxMode && (
                                    <div className="bg-blue-50/80 dark:bg-blue-950/40 border-2 border-blue-500/40 text-blue-900 dark:text-blue-200 text-xs px-4 py-3 rounded-2xl flex items-center gap-3 mt-3 text-left w-full shadow-xs">
                                        <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                                        <div className="text-xs leading-relaxed">
                                            <p className="font-bold text-blue-950 dark:text-white text-xs">Simulación Exitosa en Modo Sandbox</p>
                                            <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">La reserva fue validada por completo. El barbero no fue bloqueado en la agenda real y no se enviaron correos al cliente.</p>
                                        </div>
                                    </div>
                                )}
                                <Button 
                                    variant="alfa" 
                                    size="lg" 
                                    className="mt-8 px-8 h-12 text-base font-bold rounded-xl shadow-[0_4px_20px_rgba(32,42,73,0.8)] cursor-pointer"
                                    onClick={() => router.push('/')}
                                >
                                    Volver al Inicio
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>


                    {/* Promotion Terms Modal con Cabecera Oficial Vatos Alfa */}
                    <Dialog open={!!selectedPromotion} onOpenChange={(open) => !open && setSelectedPromotion(null)}>
                        <DialogContent hideCloseButton={true} className="max-w-md sm:max-w-lg p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background max-h-[85vh] flex flex-col">
                            {/* Cabecera Oficial */}
                            <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-[#2d3a60]/60 shrink-0">
                                <div className="header-light-beam" aria-hidden="true" />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Sparkles className="h-5 w-5 text-[#C5A880] shrink-0" />
                                        <div>
                                            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">{selectedPromotion?.name}</h3>
                                            <p className="text-xs text-slate-300">Términos y condiciones de la promoción</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedPromotion(null)}
                                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                                        aria-label="Cerrar modal"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Contenido con scrollbar estilizado */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-foreground/90 leading-relaxed text-xs sm:text-sm whitespace-pre-line">
                                {selectedPromotion?.termsAndConditions || 'No hay términos y condiciones específicos para esta promoción.'}
                            </div>

                            {/* Footer */}
                            <div className="p-4 sm:p-5 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between gap-3 shrink-0">
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="text-xs font-semibold rounded-xl border-border/80 cursor-pointer"
                                    onClick={() => {
                                        const url = `${window.location.origin}/promociones/${selectedPromotion?.id}/terminos`;
                                        navigator.clipboard.writeText(url);
                                        toast({
                                            title: "Link de términos copiado",
                                            description: "El enlace público de los términos y condiciones se ha copiado al portapapeles.",
                                        });
                                    }}
                                >
                                    <Share2 className="w-3.5 h-3.5 mr-1.5" /> Copiar Link
                                </Button>
                                <Button 
                                    variant="alfa" 
                                    size="sm"
                                    className="font-bold text-xs px-5 rounded-xl cursor-pointer"
                                    onClick={() => setSelectedPromotion(null)}
                                >
                                    Entendido
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>


                    {/* Generic Terms/Privacy Modals */}
                    <LegalModals 
                        privacyModalOpen={privacyModalOpen} 
                        setPrivacyModalOpen={setPrivacyModalOpen}
                        termsModalOpen={termsModalOpen}
                        setTermsModalOpen={setTermsModalOpen}
                        websiteSettings={websiteSettings}
                    />

                    {websiteSettings.privacyPolicyEnabled && (
                        <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                            {/* Privacy Link */}
                            {(websiteSettings.privacyText || websiteSettings.privacyUrl) && (
                                <button
                                    onClick={() => {
                                        if (websiteSettings.privacyText) {
                                            setPrivacyModalOpen(true);
                                        } else if (websiteSettings.privacyUrl) {
                                            window.open(websiteSettings.privacyUrl, '_blank');
                                        }
                                    }}
                                    className="underline hover:text-primary transition-colors"
                                >
                                    Aviso de Privacidad
                                </button>
                            )}

                            {/* Separator */}
                            {(websiteSettings.privacyText || websiteSettings.privacyUrl) && (websiteSettings.termsText || websiteSettings.termsUrl) && (
                                <span>|</span>
                            )}

                            {/* Terms Link */}
                            {(websiteSettings.termsText || websiteSettings.termsUrl) && (
                                <button
                                    onClick={() => {
                                        if (websiteSettings.termsText) {
                                            setTermsModalOpen(true);
                                        } else if (websiteSettings.termsUrl) {
                                            window.open(websiteSettings.termsUrl, '_blank');
                                        }
                                    }}
                                    className="underline hover:text-primary transition-colors"
                                >
                                    Términos y Condiciones
                                </button>
                            )}
                        </div>
                    )}

                    <div className="mt-4 text-[10px] text-center text-muted-foreground">
                        Este sitio está protegido por reCAPTCHA y se aplican la{' '}
                        <a href="https://policies.google.com/privacy" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Política de Privacidad</a> y los{' '}
                        <a href="https://policies.google.com/terms" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Términos de Servicio</a> de Google.
                    </div>

                    {step === 0 && <div className="h-16 sm:h-20 shrink-0 pointer-events-none" />}

                </div>
            </div>
        </div >
    );
}


