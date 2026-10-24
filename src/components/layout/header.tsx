
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Tag,
  Users,
  CreditCard,
  DollarSign,
  Banknote,
  ChevronDown,
  Wallet,
  Lock,
  Archive,
  ShoppingCart,
  FileText,
  LineChart,
  Settings,
  Plus,
  Gift,
  Globe,
  Copy,
  Share2,
  Landmark,
  LogOut,
  Scissors,
  Percent,
  Store,
  User,
  Menu,
  ShieldCheck,
  LayoutDashboard,
  X,
  MessageSquare,
  QrCode,
  Bell,
  Clock,
  CheckCircle2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { ExternalLink, WifiOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatures } from '@/hooks/use-features';
import { useMemo } from 'react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { playStrongNotificationAlert, initAudioUnlock, getAudioSettings, setAudioSettings, applyFontSizeScale } from '@/lib/notification-sound';

// Removed top-level mainNavLinks




const salesNavLinks = [
  { href: '/sales/my-performance', label: 'Mi Rendimiento', icon: LineChart, permission: ['ver_mis_ventas', 'ver_mis_comisiones', 'ver_mis_propinas'] },
  { href: '/sales/invoiced', label: 'Ventas Facturadas', icon: CreditCard, permission: ['ver_ventas_facturadas'] },
  { href: '/sales/commissions', label: 'Reporte de Comisiones', icon: DollarSign, permission: ['ver_reporte_comisiones'] },
  { href: '/sales/cash-box', label: 'Caja de Ventas', icon: Banknote, permission: ['ver_caja'] },
  { href: '/sales/tips', label: 'Propinas', icon: Gift, permission: ['ver_propinas'] },
]

const productsNavLinks = [
  { href: '/products', label: 'Inventario', icon: Archive, permission: 'ver_inventario' },
  { href: '/products/stock-movement', label: 'Movimiento de Stock', icon: LineChart, permission: 'ver_movimiento_stock' },
  { href: '/products/sales', label: 'Venta de productos', icon: ShoppingCart, permission: 'ver_venta_productos' },
];

const reportsNavLinks = [
  { href: '/reports/reservations', label: 'Reporte de reservas', icon: FileText, permission: 'ver_reporte_reservas' },
  { href: '/reports/sales', label: 'Reporte de ventas', icon: LineChart, permission: 'ver_reporte_ventas' },
  { href: '/reports/cash-closings', label: 'Cierres de Caja', icon: Wallet, permission: 'ver_cierres_caja' },
  { href: '/reports/audit', label: 'Auditoría', icon: ShieldCheck, permission: 'ver_auditoria' },
];

const monthNamesNav = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const getCurrentMonthName = () => monthNamesNav[new Date().getMonth()];

const finanzasNavLinks = [
  { href: '/finanzas/resumen', label: 'Resumen Anual', icon: LineChart, permission: 'ver_finanzas' },
  { href: `/finanzas/${getCurrentMonthName()}`, label: 'Vista Mensual', icon: DollarSign, permission: 'ver_finanzas' },
  { href: '/finanzas/fiscal', label: 'Control Fiscal RESICO', icon: Landmark, permission: 'ver_finanzas' },
];

const adminNavLinks = [
  { href: '/admin/profesionales', label: 'Profesionales', icon: Users, permission: 'ver_profesionales' },
  { href: '/admin/servicios', label: 'Servicios', icon: Scissors, permission: 'ver_servicios' },
  { href: '/admin/comisiones', label: 'Comisiones', icon: Percent, permission: 'ver_comisiones' },
  { href: '/admin/ajustes', label: 'Ajustes', icon: Settings, permission: 'ver_ajustes' },
  { href: '/admin/nomina', label: 'Nómina', icon: Tag, permission: 'ver_nomina' },
];

export default function Header() {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, signOut, db } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: empresaData } = useFirestoreQuery<any>('empresa');
  const { enableBarberDashboard } = useFeatures();
  const isOnline = useNetworkStatus();

  const canSee = (permission: string | string[]) => {
    if (!user || !user.permissions) return false;

    // Admin always has all permissions EXCEPT FOR personal views unless explicitly granted
    const isPersonalPermission = Array.isArray(permission)
      ? permission.every(p => p.startsWith('ver_mis_'))
      : permission.startsWith('ver_mis_');

    if (user.role === 'Administrador general' && !isPersonalPermission) return true;

    if (Array.isArray(permission)) {
      return permission.some(p => user.permissions!.includes(p));
    }
    return user.permissions.includes(permission);
  }

  const canSeeAny = (permissions: (string | string[] | undefined)[]) => {
    if (!user || !user.permissions) return false;

    // Check if ALL permissions being queried are personal
    const allPersonal = permissions.every(p => {
      if (!p) return true;
      if (Array.isArray(p)) return p.every(singleP => singleP.startsWith('ver_mis_'));
      return p.startsWith('ver_mis_');
    });

    if (user.role === 'Administrador general' && !allPersonal) return true;

    return permissions.some(p => {
      if (!p) return false;
      if (Array.isArray(p)) return p.some(singleP => user.permissions!.includes(singleP));
      return user.permissions!.includes(p);
    });
  }

  // Fetch ALL professionals to find the correct document ID for the logged-in user's share link.
  // We fetch the whole collection (it's small and public) and filter client-side to avoid
  // potential issues with Firestore where-query indexes or security rules.
  const { data: allProfessionals = [] } = useFirestoreQuery<any>('profesionales');
  const { data: allPromotions = [] } = useFirestoreQuery<Promotion>('promociones');
  const hasActivePromotions = useMemo(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return allPromotions.some(p => p.active && (!p.endDate || today <= p.endDate));
  }, [allPromotions]);

  const myProfessional = useMemo(() => {
    if (!user || allProfessionals.length === 0) return null;
    const userEmailClean = user.email?.toLowerCase().trim();
    const userUid = user.uid;
    return allProfessionals.find((p: any) =>
      !p.deleted && (
        (userUid && p.userId === userUid) ||
        (userEmailClean && p.email?.toLowerCase().trim() === userEmailClean)
      )
    ) || null;
  }, [user, allProfessionals]);

  const professionalId = useMemo(() => {
    return myProfessional ? myProfessional.id : user?.uid;
  }, [myProfessional, user?.uid]);

  const isStaffRole = Boolean(
    user?.role && (user.role.toLowerCase().includes('staff') || user.role.toLowerCase().includes('barbero'))
  );

  // Real-time notifications for Staff new appointments
  const [staffAppointments, setStaffAppointments] = useState<any[]>([]);
  const [seenAppointmentIds, setSeenAppointmentIds] = useState<string[]>([]);
  const [isStaffNotifOpen, setIsStaffNotifOpen] = useState(false);
  const knownAppointmentIdsRef = useRef<Set<string>>(new Set());
  const isInitialSnapshotRef = useRef<boolean>(true);

  useEffect(() => {
    initAudioUnlock();
    const local = getAudioSettings();
    applyFontSizeScale(local.font_size_scale);
  }, []);

  useEffect(() => {
    const userAudio = (user as any)?.audio_settings;
    if (userAudio) {
      setAudioSettings({
        notification_sound: userAudio.notification_sound || 'alerta_insistente',
        notification_volume: typeof userAudio.notification_volume === 'number' ? userAudio.notification_volume : 1.0,
        vibration_enabled: userAudio.vibration_enabled !== false,
        agenda_click_sound_enabled: userAudio.agenda_click_sound_enabled !== false,
        font_size_scale: userAudio.font_size_scale || 'normal',
      });
    }
  }, [user]);

  useEffect(() => {
    if (!db || !myProfessional?.id) return;

    const storageKey = `vatos_staff_seen_res_${myProfessional.id}`;
    let storedSeen: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        storedSeen = JSON.parse(raw);
        if (Array.isArray(storedSeen)) {
          setSeenAppointmentIds(storedSeen);
        }
      }
    } catch (_) {}

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    isInitialSnapshotRef.current = true;
    knownAppointmentIdsRef.current = new Set();

    const q = query(collection(db, 'reservas'), where('fecha', '>=', todayStr));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const myProfId = myProfessional.id;
        const matchingDocs = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((res) => {
            if (res.estado === 'Cancelado') return false;
            const isAssigned =
              res.barbero_id === myProfId ||
              (Array.isArray(res.items) && res.items.some((item: any) => item.barbero_id === myProfId));
            return isAssigned;
          });

        // Sort newest created or upcoming first
        matchingDocs.sort((a, b) => {
          const dateCompare = String(a.fecha || '').localeCompare(String(b.fecha || ''));
          if (dateCompare !== 0) return dateCompare;
          return String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''));
        });

        setStaffAppointments(matchingDocs);

        if (isInitialSnapshotRef.current) {
          isInitialSnapshotRef.current = false;
          matchingDocs.forEach((r) => knownAppointmentIdsRef.current.add(r.id));

          // If localStorage was never initialized for this barber, mark existing older appointments as seen
          // except those created in the last 2 hours so recent bookings still show a badge
          if (!localStorage.getItem(storageKey)) {
            const twoHoursAgoMs = Date.now() - 2 * 60 * 60 * 1000;
            const autoSeen = matchingDocs
              .filter((r) => {
                const createdMs = r.creado_en?.toMillis
                  ? r.creado_en.toMillis()
                  : r.created_at?.toMillis
                  ? r.created_at.toMillis()
                  : 0;
                return !createdMs || createdMs < twoHoursAgoMs;
              })
              .map((r) => r.id);
            setSeenAppointmentIds(autoSeen);
            try {
              localStorage.setItem(storageKey, JSON.stringify(autoSeen));
            } catch (_) {}
          }
          return;
        }

        // Detect newly added reservations for this professional
        const newlyAdded = matchingDocs.filter((r) => !knownAppointmentIdsRef.current.has(r.id));
        matchingDocs.forEach((r) => knownAppointmentIdsRef.current.add(r.id));

        if (newlyAdded.length > 0) {
          playStrongNotificationAlert();
          newlyAdded.forEach((newRes) => {
            const clientDisplayName =
              newRes.cliente_nombre ||
              (newRes.customer
                ? `${newRes.customer.nombre || ''} ${newRes.customer.apellido || ''}`.trim()
                : '') ||
              'Cliente';
            const servicesSummary =
              Array.isArray(newRes.items) && newRes.items.length > 0
                ? newRes.items.map((i: any) => i.nombre || i.servicio).filter(Boolean).join(', ')
                : newRes.servicio || 'Servicio agendado';
            const fechaLabel = newRes.fecha === todayStr ? 'Hoy' : newRes.fecha;

            toast({
              title: '💈 ¡Nueva cita agendada!',
              description: `${clientDisplayName} • ${servicesSummary} (${fechaLabel} a las ${newRes.hora_inicio || ''})`,
            });
          });
        }
      },
      (err) => {
        console.warn('Error listening to staff appointments:', err);
      }
    );

    return () => unsubscribe();
  }, [db, myProfessional?.id, toast]);

  const unreadStaffAppointments = useMemo(() => {
    const seenSet = new Set(seenAppointmentIds);
    return staffAppointments.filter((r) => !seenSet.has(r.id));
  }, [staffAppointments, seenAppointmentIds]);

  const markAllStaffAppointmentsAsRead = () => {
    if (!myProfessional?.id) return;
    const allIds = Array.from(new Set([...seenAppointmentIds, ...staffAppointments.map((r) => r.id)]));
    setSeenAppointmentIds(allIds);
    try {
      localStorage.setItem(`vatos_staff_seen_res_${myProfessional.id}`, JSON.stringify(allIds));
    } catch (_) {}
  };

  const markSingleAppointmentAsRead = (resId: string) => {
    if (!myProfessional?.id) return;
    if (seenAppointmentIds.includes(resId)) return;
    const updated = [...seenAppointmentIds, resId];
    setSeenAppointmentIds(updated);
    try {
      localStorage.setItem(`vatos_staff_seen_res_${myProfessional.id}`, JSON.stringify(updated));
    } catch (_) {}
  };

  // Real-time notifications for Reception / Conversations needing human attention or unread messages
  const [pendingConversationsCount, setPendingConversationsCount] = useState<number>(0);
  const [humanRequestConversationsCount, setHumanRequestConversationsCount] = useState<number>(0);
  const isInitialConvSnapshotRef = useRef<boolean>(true);
  const prevConvStateRef = useRef<Map<string, { modo: string; unread: number }>>(new Map());

  const canViewConversations = canSee('ver_conversaciones');

  useEffect(() => {
    if (!db || !user || !canViewConversations) {
      setPendingConversationsCount(0);
      setHumanRequestConversationsCount(0);
      return;
    }

    isInitialConvSnapshotRef.current = true;
    prevConvStateRef.current = new Map();

    const q = query(collection(db, 'conversaciones'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((conv) => !String(conv.id || '').startsWith('sim-sandbox') && conv.canal !== 'simulador');

        let totalAttentionOrUnread = 0;
        let totalHumanRequests = 0;

        docs.forEach((conv) => {
          const unread = Number(conv.mensajes_no_leidos || 0);
          const needsHuman = conv.modo_atencion === 'requiere_atencion';
          if (needsHuman) {
            totalHumanRequests += 1;
          }
          if (needsHuman || unread > 0) {
            totalAttentionOrUnread += 1;
          }
        });

        setPendingConversationsCount(totalAttentionOrUnread);
        setHumanRequestConversationsCount(totalHumanRequests);

        if (isInitialConvSnapshotRef.current) {
          isInitialConvSnapshotRef.current = false;
          docs.forEach((conv) => {
            prevConvStateRef.current.set(conv.id, {
              modo: conv.modo_atencion || 'bot_activo',
              unread: Number(conv.mensajes_no_leidos || 0),
            });
          });
          return;
        }

        let shouldPlayAlert = false;
        docs.forEach((conv) => {
          const prev = prevConvStateRef.current.get(conv.id);
          const currentModo = conv.modo_atencion || 'bot_activo';
          const currentUnread = Number(conv.mensajes_no_leidos || 0);
          const clientName = conv.cliente_nombre || conv.cliente_telefono || 'Un cliente';

          const justRequestedHuman =
            currentModo === 'requiere_atencion' && (!prev || prev.modo !== 'requiere_atencion');
          const hasNewUnreadMessage =
            currentUnread > (prev?.unread || 0);

          if (justRequestedHuman) {
            shouldPlayAlert = true;
            toast({
              title: '🔔 ¡Solicitud de atención en Recepción!',
              description: `${clientName} pidió hablar con una persona en el chat.`,
            });
          } else if (hasNewUnreadMessage && (currentModo === 'requiere_atencion' || currentModo === 'humano_al_mando')) {
            shouldPlayAlert = true;
            toast({
              title: `💬 Nuevo mensaje de ${clientName}`,
              description: conv.ultimo_mensaje || 'Nuevo mensaje recibido en Recepción.',
            });
          } else if (hasNewUnreadMessage) {
            shouldPlayAlert = true;
          }

          prevConvStateRef.current.set(conv.id, {
            modo: currentModo,
            unread: currentUnread,
          });
        });

        if (shouldPlayAlert) {
          playStrongNotificationAlert();
        }
      },
      (err) => {
        console.warn('Error listening to conversations in header:', err);
      }
    );

    return () => unsubscribe();
  }, [db, user, canViewConversations, toast]);

  const mainNavLinks = useMemo(() => [
    ...(enableBarberDashboard ? [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'ver_agenda' }] : []),
    { href: '/agenda', label: 'Agenda', icon: Calendar, permission: 'ver_agenda' },
    { href: '/clients', label: 'Clientes', icon: Users, permission: 'ver_clientes' },
    { href: '/conversations', label: 'Mensajes', icon: MessageSquare, permission: 'ver_conversaciones' },
  ], [enableBarberDashboard]);

  // Get website URL from settings or fallback to current origin
  const configuredWebsiteUrl = empresaData?.[0]?.website_slug;
  const displayUrl = configuredWebsiteUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  const personalWebsiteUrl = useMemo(() => {
    return displayUrl ? `${displayUrl.endsWith('/') ? displayUrl.slice(0, -1) : displayUrl}/reservar?professionalId=${professionalId}` : '';
  }, [displayUrl, professionalId]);

  const websiteGroupLinks = useMemo(() => {
    const links = [];
    if (user?.role !== 'Administrador general' && personalWebsiteUrl) {
      links.push({
        label: 'Mi Enlace Web',
        url: personalWebsiteUrl,
        icon: User,
        isPersonal: true
      });
    }
    if (displayUrl) {
      links.push({
        label: 'Sitio Web General',
        url: displayUrl,
        icon: Store,
        isPersonal: false
      });
    }
    return links;
  }, [user?.role, personalWebsiteUrl, displayUrl]);

  const activePromosLinks = useMemo(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return allPromotions
      .filter(p => p.active && (!p.endDate || today <= p.endDate))
      .map(promo => ({
        href: `/promociones/${promo.id}`,
        label: promo.name,
        icon: Tag
      }));
  }, [allPromotions]);

  const filteredMenuGroups = useMemo(() => {
    const rawGroups = [
      {
        title: "Menú Principal",
        links: [
          ...(enableBarberDashboard ? [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'ver_agenda' }] : []),
          { href: '/agenda', label: 'Agenda', icon: Calendar, permission: 'ver_agenda' },
          { href: '/clients', label: 'Clientes', icon: Users, permission: 'ver_clientes' },
          { href: '/conversations', label: 'Mensajes', icon: MessageSquare, permission: 'ver_conversaciones' },
        ]
      },
      {
        title: "Ventas",
        links: [
          { href: '/sales/my-performance', label: 'Mi Rendimiento', icon: LineChart, permission: ['ver_mis_ventas', 'ver_mis_comisiones', 'ver_mis_propinas'] },
          { href: '/sales/cash-box', label: 'Caja de Ventas', icon: Banknote, permission: ['ver_caja'] },
          { href: '/sales/invoiced', label: 'Ventas Facturadas', icon: CreditCard, permission: ['ver_ventas_facturadas'] },
          { href: '/sales/commissions', label: 'Reporte de Comisiones', icon: DollarSign, permission: ['ver_reporte_comisiones'] },
          { href: '/sales/tips', label: 'Propinas', icon: Gift, permission: ['ver_propinas'] },
        ]
      },
      {
        title: "Productos",
        links: [
          { href: '/products', label: 'Inventario', icon: Archive, permission: 'ver_inventario' },
          { href: '/products/stock-movement', label: 'Movimiento de Stock', icon: LineChart, permission: 'ver_movimiento_stock' },
          { href: '/products/sales', label: 'Venta de Productos', icon: ShoppingCart, permission: 'ver_venta_productos' },
        ]
      },
      {
        title: "Reportes",
        links: [
          { href: '/reports/reservations', label: 'Reporte Reservas', icon: FileText, permission: 'ver_reporte_reservas' },
          { href: '/reports/sales', label: 'Reporte Ventas', icon: LineChart, permission: 'ver_reporte_ventas' },
          { href: '/reports/cash-closings', label: 'Cierres de Caja', icon: Wallet, permission: 'ver_cierres_caja' },
          { href: '/reports/audit', label: 'Auditoría', icon: ShieldCheck, permission: 'ver_auditoria' },
        ]
      },
      {
        title: "Finanzas",
        links: [
          { href: '/finanzas/resumen', label: 'Resumen Anual', icon: LineChart, permission: 'ver_finanzas' },
          { href: `/finanzas/${getCurrentMonthName()}`, label: 'Vista Mensual', icon: DollarSign, permission: 'ver_finanzas' },
        ]
      },
      {
        title: "Administración",
        links: [
          { href: '/admin/profesionales', label: 'Profesionales', icon: Users, permission: 'ver_profesionales' },
          { href: '/admin/servicios', label: 'Servicios', icon: Scissors, permission: 'ver_servicios' },
          { href: '/admin/comisiones', label: 'Comisiones', icon: Percent, permission: 'ver_comisiones' },
          { href: '/admin/ajustes', label: 'Ajustes', icon: Settings, permission: 'ver_ajustes' },
          { href: '/admin/nomina', label: 'Nómina', icon: Tag, permission: 'ver_nomina' },
        ]
      },
      {
        title: "Promociones",
        links: [
          { href: '/promociones', label: 'Todas las Promociones', icon: Gift, permission: 'ver_promociones', enabled: hasActivePromotions && canSee('ver_promociones') },
          ...activePromosLinks.map(l => ({ ...l, permission: 'ver_promociones' }))
        ]
      }
    ];

    return rawGroups.map(group => {
      const visibleLinks = group.links.filter(link => {
        if ((link as any).enabled === false) return false;
        if (link.permission && !canSee(link.permission)) return false;
        return true;
      });
      return {
        ...group,
        links: visibleLinks
      };
    }).filter(group => group.links.length > 0);
  }, [canSee, enableBarberDashboard, hasActivePromotions, activePromosLinks]);

  const isAuthPage = pathname === '/login';
  const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/privacidad' || pathname === '/terminos' || pathname.startsWith('/promociones/');

  const websiteUrl = 'vatos-alfa-barbershop.web.app';


  const copyToClipboard = () => {
    navigator.clipboard.writeText(websiteUrl);
    toast({
      title: '¡Copiado!',
      description: 'El enlace a tu sitio web ha sido copiado al portapapeles.',
    });
  }

  const handleLogout = async () => {
    if (!signOut) return;
    try {
      await signOut();
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión correctamente.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cerrar la sesión. Inténtalo de nuevo.",
      });
    }
  }

  const getInitials = (name?: string | null) => {
    if (!name) return "VA";
    const nameParts = name.split(' ');
    if (nameParts.length > 1) {
      return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }



  const dispatchCustomEvent = (eventName: string) => {
    document.dispatchEvent(new CustomEvent(eventName));
  }

  // Helper to close menu when clicking a link
  const handleLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  if (!user || isAuthPage || isPublicPage) {
    return null;
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-b border-[#2d3a60]/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)] backdrop-blur-sm">
        {/* Haz de luz animado sutil que recorre la franja superior sin bloquear tooltips o menús */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="header-light-beam" />
        </div>

        <div className="relative z-10 flex h-16 items-center px-4 md:px-6">

          {!isOnline && (
            <div className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-bold mr-4 flex items-center animate-pulse">
              <WifiOff className="h-3 w-3 mr-1" />
              OFFLINE
            </div>
          )}

          {/* Mobile Menu (controlled via bottom navigation) - Opción B: Fondo Claro (Continuidad Total con la Agenda) */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} modal={false}>
            <SheetContent
              side="right"
              overlayClassName="bg-black/35 backdrop-blur-xs pointer-events-none"
              onInteractOutside={(e) => {
                // Allow clicks on the bottom navigation bar to pass through and work normally
                const target = e.target as HTMLElement | null;
                if (target?.closest('[data-mobile-bottom-nav="true"]')) {
                  return;
                }
              }}
              className="w-full max-w-full sm:max-w-md h-[calc(100dvh-4rem)] sm:h-full top-0 border-none sm:border-l sm:border-slate-200 bg-slate-50 text-slate-800 p-0 [&>button]:hidden shadow-2xl flex flex-col z-[90]"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Menú de Navegación</SheetTitle>
              </SheetHeader>

              {/* Cabecera Oficial Vatos Alfa con Haz de Luz Oblicuo y Perfil */}
              <div className="flex-shrink-0 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                  <div className="header-light-beam" />
                </div>

                <div className="flex items-center gap-2.5 relative z-10 min-w-0">
                  <Avatar className="h-9 w-9 border border-blue-500/40 rounded-xl shrink-0 shadow-sm">
                    <AvatarImage src={user?.avatarUrl} alt={user?.displayName || "Usuario"} />
                    <AvatarFallback className="rounded-xl text-xs font-bold bg-[#1b2644] text-blue-300">
                      {getInitials(user?.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white truncate max-w-[200px]">
                      {user?.displayName || "Usuario"}
                    </span>
                    <span className="text-[10px] text-slate-400 capitalize truncate">
                      {user?.role || "Staff"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer relative z-10 shrink-0"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Contenido Desplazable con Tarjetas Blancas Nítidas y Fondo Gris Perla */}
              <ScrollArea className="flex-1 px-4 py-3.5">
                <div className="space-y-4 pb-24">
                  {/* Website links group */}
                  {websiteGroupLinks.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-blue-600" />
                        Sitio Web y Reservas
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {websiteGroupLinks.map((link) => {
                          const handleCopy = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(link.url);
                            toast({
                              title: "Enlace copiado",
                              description: `El enlace ${link.isPersonal ? 'personal' : 'general'} ha sido copiado.`
                            });
                          };

                          const handleOpen = () => {
                            const previewUrl = link.url.includes('?') ? `${link.url}&preview=true` : `${link.url}?preview=true`;
                            window.open(previewUrl, '_blank');
                          };

                          return (
                            <div
                              key={link.label}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-blue-500 hover:shadow-md transition-all"
                            >
                              <button
                                onClick={handleOpen}
                                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                              >
                                <link.icon className={cn("h-4.5 w-4.5 shrink-0", link.isPersonal ? "text-[#C5A880]" : "text-blue-600")} />
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-slate-800 block truncate">{link.label}</span>
                                  <span className="text-[10px] text-slate-400 block truncate">Abrir sitio web</span>
                                </div>
                              </button>
                              <button
                                onClick={handleCopy}
                                className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0 transition-colors"
                                title="Copiar enlace"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Filtered Categories */}
                  {filteredMenuGroups.map((group) => (
                    <div key={group.title}>
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                        {group.title}
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {group.links.map((link) => {
                          const Icon = link.icon;
                          const isActive = pathname === link.href || (link.href === '/agenda' && pathname.startsWith('/agenda'));
                          const isPromo = link.href.startsWith('/promociones');
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={handleLinkClick}
                              className={cn(
                                "relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-200 h-[64px] group shadow-[0_2px_8px_rgba(0,0,0,0.04)]",
                                "bg-white border-slate-200/80 hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5",
                                isActive && "border-2 border-blue-500 bg-blue-50/70 shadow-[0_0_12px_rgba(59,130,246,0.18)]"
                              )}
                            >
                              {link.href === '/conversations' && pendingConversationsCount > 0 && (
                                <span
                                  className={cn(
                                    "absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-sm",
                                    humanRequestConversationsCount > 0
                                      ? "bg-amber-500 animate-pulse"
                                      : "bg-blue-600"
                                  )}
                                >
                                  {pendingConversationsCount}
                                </span>
                              )}
                              <Icon className={cn(
                                "h-4.5 w-4.5 mb-1 group-hover:scale-110 transition-transform duration-200",
                                isPromo
                                  ? "text-[#C5A880]"
                                  : (isActive
                                      ? "text-blue-600"
                                      : "text-blue-600 group-hover:text-blue-700")
                              )} />
                              <span className={cn(
                                "text-[10px] text-center leading-tight line-clamp-2 px-0.5",
                                isActive ? "font-bold text-blue-900" : "font-semibold text-slate-700 group-hover:text-slate-900"
                              )}>
                                {link.label}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Acciones de Cuenta (Mi Perfil y Cerrar Sesión) */}
                  <div className="pt-2 border-t border-slate-200/80">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Mi Cuenta
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href="/settings/profile"
                        onClick={handleLinkClick}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all group"
                      >
                        <User className="h-4 w-4 text-blue-600 shrink-0 group-hover:scale-105 transition-transform" />
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 truncate">Mi Perfil</span>
                      </Link>

                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          handleLogout();
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
                      >
                        <LogOut className="h-4 w-4 text-blue-600 shrink-0 group-hover:scale-105 transition-transform" />
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 truncate">Cerrar Sesión</span>
                      </button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <Link href="/agenda" className="mr-4 flex items-center flex-shrink-0">
            <div className="relative h-14 w-32 md:w-40 lg:w-52">
              <Image
                src="/logo-header-blanco.webp"
                alt="VATOS ALFA"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </Link>
          <nav className="hidden md:flex items-center min-w-0 flex-1 text-xs font-medium">
            {mainNavLinks.map(({ href, label, permission }) => {
              const isActive = (pathname === href) || (href === '/agenda' && pathname.startsWith('/agenda'));
              const isConversationsLink = href === '/conversations';
              return (
                canSee(permission) && (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-xs font-medium whitespace-nowrap',
                      isActive
                        ? 'bg-secondary text-secondary-foreground font-semibold'
                        : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                    )}
                  >
                    <span>{label}</span>
                    {isConversationsLink && pendingConversationsCount > 0 && (
                      <span
                        title={
                          humanRequestConversationsCount > 0
                            ? `${humanRequestConversationsCount} cliente(s) solicitan hablar con una persona`
                            : `${pendingConversationsCount} conversación(es) con mensajes sin leer`
                        }
                        className={cn(
                          'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white shadow-sm',
                          humanRequestConversationsCount > 0
                            ? 'bg-amber-500 animate-pulse ring-2 ring-amber-400/50'
                            : 'bg-blue-600 animate-pulse'
                        )}
                      >
                        {pendingConversationsCount}
                      </span>
                    )}
                  </Link>
                )
              )
            })}

            {canSeeAny(salesNavLinks.map(l => l.permission)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-2.5 py-1.5 h-auto rounded-md transition-colors text-xs font-medium whitespace-nowrap',
                    pathname.startsWith('/sales')
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Ventas <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5" align="start">
                  {salesNavLinks.map(({ href, label, icon: Icon, permission }) => (
                    canSee(permission!) && (
                      <DropdownMenuItem key={href} asChild>
                        <Link href={href!}>
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{label}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canSeeAny(productsNavLinks.map(l => l.permission)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-2.5 py-1.5 h-auto rounded-md transition-colors text-xs font-medium whitespace-nowrap',
                    pathname.startsWith('/products')
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Productos <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5" align="start">
                  {productsNavLinks.map(({ href, label, icon: Icon, permission }) => (
                    canSee(permission!) && (
                      <DropdownMenuItem key={href} asChild>
                        <Link href={href!}>
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{label}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canSeeAny(reportsNavLinks.map(l => l.permission)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-2.5 py-1.5 h-auto rounded-md transition-colors text-xs font-medium whitespace-nowrap',
                    pathname.startsWith('/reports')
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Reportes <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5" align="start">
                  {reportsNavLinks.map(({ href, label, icon: Icon, permission }) => (
                    canSee(permission!) && (
                      <DropdownMenuItem key={href} asChild>
                        <Link href={href!}>
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{label}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canSee('ver_finanzas') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-2.5 py-1.5 h-auto rounded-md transition-colors text-xs font-medium whitespace-nowrap',
                    pathname.startsWith('/finanzas')
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Finanzas <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5" align="start">
                  {finanzasNavLinks.map((item) => (
                    canSee(item.permission!) && (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href!}>
                          {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canSeeAny(adminNavLinks.map(l => l.permission!)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-2.5 py-1.5 h-auto rounded-md transition-colors text-xs font-medium whitespace-nowrap',
                    pathname.startsWith('/admin')
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Administración <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5" align="start">
                  {adminNavLinks.map(({ href, label, icon: Icon, permission }) => (
                    canSee(permission!) && (
                      <DropdownMenuItem key={href} asChild>
                        <Link href={href!}>
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{label}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {hasActivePromotions && canSee('ver_promociones') && (
              <Link
                href="/promociones"
                className={cn(
                  'px-2.5 py-1.5 h-auto rounded-md transition-colors text-xs font-medium whitespace-nowrap flex items-center gap-1.5 border ml-1',
                  pathname.startsWith('/promociones')
                    ? 'bg-[#202A49] text-[#C5A880] border-[#C5A880] font-semibold shadow-xs'
                    : 'text-[#C5A880] bg-[#162038]/60 hover:bg-[#1f2b4c] hover:text-[#e4cfb4] border-[#C5A880]/40'
                )}
                title="Promociones activas"
              >
                <Gift className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                <span>Promociones</span>
                <span className="relative flex h-2 w-2 ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A880] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C5A880]"></span>
                </span>
              </Link>
            )}

          </nav>
          <div className="ml-auto flex items-center space-x-1.5 flex-shrink-0">
            <TooltipProvider delayDuration={150}>
              {/* Escanear QR */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatchCustomEvent('open-qr-scanner')}
                    className="h-8 w-8 text-[#C5A880] hover:text-[#e4cfb4] hover:bg-white/10 rounded-lg transition-colors inline-flex"
                    aria-label="Escanear QR"
                  >
                    <QrCode className="h-4 w-4 text-[#C5A880]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs bg-[#151b2e] text-white border-slate-700 shadow-xl">
                  Escanear QR
                </TooltipContent>
              </Tooltip>

              {/* Nuevo */}
              <div className="hidden sm:block">
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          aria-label="Nuevo"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs bg-[#151b2e] text-white border-slate-700 shadow-xl">
                      Nuevo
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-56 bg-[#151b2e] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5">
                    <DropdownMenuItem onSelect={() => dispatchCustomEvent('open-qr-scanner')} className="rounded-lg focus:bg-blue-500/20">
                      <QrCode className="mr-2 h-4 w-4 text-[#C5A880]" />
                      <span className="font-semibold text-[#C5A880]">Escanear QR de cliente</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-reservation')} disabled={!canSee('crear_reservas')} className="rounded-lg focus:bg-blue-500/20">
                      <Calendar className="mr-2 h-4 w-4" />
                      <span>Crear nueva reserva</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-block')} disabled={!canSee('bloquear_horarios')} className="rounded-lg focus:bg-blue-500/20">
                      <Lock className="mr-2 h-4 w-4" />
                      <span>Bloquear horario</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-sale')} disabled={!canSee('registrar_ventas')} className="rounded-lg focus:bg-blue-500/20">
                      <Tag className="mr-2 h-4 w-4" />
                      <span>Registrar nueva venta</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Web */}
              <div className="hidden sm:block">
                <Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          aria-label="Sitio Web y Enlaces"
                        >
                          <Globe className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs bg-[#151b2e] text-white border-slate-700 shadow-xl">
                      Web
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent className="w-80 p-4 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="end">
                    <div className="flex flex-col space-y-4">
                      {user?.role !== 'Administrador general' && (
                        <div className="space-y-2 border-b border-border/50 pb-4">
                          <h4 className="font-semibold leading-none flex items-center text-primary"><User className="mr-2 h-4 w-4" /> Mi Enlace Personal</h4>
                          <p className="text-xs text-muted-foreground break-all">
                            {displayUrl ? `${displayUrl.endsWith('/') ? displayUrl.slice(0, -1) : displayUrl}/reservar?professionalId=${professionalId}` : ''}
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <Button variant="outline" size="sm" className="w-full" onClick={() => {
                              const baseUrl = displayUrl ? (displayUrl.endsWith('/') ? displayUrl.slice(0, -1) : displayUrl) : '';
                              if (baseUrl) {
                                const url = `${baseUrl}/reservar?professionalId=${professionalId}&preview=true`;
                                window.open(url, '_blank');
                              }
                            }}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Ir a mi enlace
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => {
                              const baseUrl = displayUrl ? (displayUrl.endsWith('/') ? displayUrl.slice(0, -1) : displayUrl) : '';
                              navigator.clipboard.writeText(`${baseUrl}/reservar?professionalId=${professionalId}`);
                              toast({ title: "Link copiado", description: "Tu enlace personal ha sido copiado." });
                            }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <h4 className="font-semibold leading-none flex items-center text-primary"><Store className="mr-2 h-4 w-4" /> Enlace General</h4>
                        <p className="text-xs text-muted-foreground break-all">
                          {displayUrl}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <Button variant="outline" size="sm" className="w-full" onClick={() => {
                            if (displayUrl) {
                              const previewUrl = displayUrl.includes('?') ? `${displayUrl}&preview=true` : `${displayUrl}?preview=true`;
                              window.open(previewUrl, '_blank');
                            }
                          }}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Ir a la web
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => {
                            navigator.clipboard.writeText(displayUrl);
                            toast({ title: "Link copiado", description: "El enlace general se ha copiado al portapapeles." });
                          }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Ajustes */}
              {user?.role === 'Administrador general' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/settings/empresa" passHref>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Ajustes"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs bg-[#151b2e] text-white border-slate-700 shadow-xl">
                    Ajustes
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Campana de Notificaciones de Citas para Staff / Profesionales */}
              {(isStaffRole || myProfessional) && (
                <Popover open={isStaffNotifOpen} onOpenChange={setIsStaffNotifOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      aria-label="Notificaciones de mis citas"
                      title="Notificaciones de mis citas"
                    >
                      <Bell className={cn("h-4 w-4", unreadStaffAppointments.length > 0 && "text-blue-400")} />
                      {unreadStaffAppointments.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full h-3.5 min-w-[14px] px-0.5 flex items-center justify-center shadow-xs animate-pulse">
                          {unreadStaffAppointments.length}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-80 sm:w-96 p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#0c1222] text-white overflow-hidden"
                  >
                    {/* Cabecera Oficial VATOS ALFA */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-3.5 border-b border-slate-800 flex items-center justify-between">
                      <div className="header-light-beam" aria-hidden="true" />
                      <div className="relative z-10 flex items-center gap-2">
                        <Bell className="h-4 w-4 text-blue-400 shrink-0" />
                        <div>
                          <h4 className="font-bold text-xs sm:text-sm text-white leading-none">
                            Mis Citas Agendadas
                          </h4>
                          <p className="text-[10px] text-slate-300 mt-1 leading-none">
                            {unreadStaffAppointments.length > 0
                              ? `${unreadStaffAppointments.length} nueva(s) sin revisar`
                              : `${staffAppointments.length} cita(s) programadas`}
                          </p>
                        </div>
                      </div>
                      {unreadStaffAppointments.length > 0 && (
                        <button
                          type="button"
                          onClick={markAllStaffAppointmentsAsRead}
                          className="relative z-10 text-[10px] font-semibold text-blue-300 hover:text-white bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-lg px-2 py-1 transition-colors"
                        >
                          Marcar leídas
                        </button>
                      )}
                    </div>

                    {/* Lista de citas */}
                    <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/80">
                      {staffAppointments.length === 0 ? (
                        <div className="p-6 text-center space-y-1.5">
                          <CheckCircle2 className="h-7 w-7 text-slate-500 mx-auto" />
                          <p className="text-xs font-semibold text-slate-200">Sin citas pendientes</p>
                          <p className="text-[11px] text-slate-400">
                            Te notificaremos con sonido cuando te agenden una nueva cita.
                          </p>
                        </div>
                      ) : (
                        staffAppointments.slice(0, 20).map((res) => {
                          const isUnread = !seenAppointmentIds.includes(res.id);
                          const clientName =
                            res.cliente_nombre ||
                            (res.customer
                              ? `${res.customer.nombre || ''} ${res.customer.apellido || ''}`.trim()
                              : '') ||
                            'Cliente';
                          const servicesText =
                            Array.isArray(res.items) && res.items.length > 0
                              ? res.items.map((i: any) => i.nombre || i.servicio).filter(Boolean).join(', ')
                              : res.servicio || 'Servicio';

                          return (
                            <Link
                              key={res.id}
                              href="/agenda"
                              onClick={() => {
                                markSingleAppointmentAsRead(res.id);
                                setIsStaffNotifOpen(false);
                              }}
                              className={cn(
                                "block p-3 transition-colors hover:bg-slate-800/60",
                                isUnread ? "bg-blue-500/10" : "bg-transparent"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    <span className="text-xs font-bold text-white truncate">
                                      {clientName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                                    <Scissors className="h-3 w-3 text-blue-400 shrink-0" />
                                    <span className="truncate">{servicesText}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                                    <span className="font-semibold text-slate-200">
                                      {res.fecha} • {res.hora_inicio}
                                      {res.hora_fin ? ` - ${res.hora_fin}` : ''}
                                    </span>
                                  </div>
                                </div>
                                {isUnread ? (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 shrink-0">
                                    Nueva
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                    {res.estado || 'Reservado'}
                                  </span>
                                )}
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-lg">
                  <Avatar className="h-9 w-9 rounded-lg">
                    <AvatarImage src={user?.avatarUrl || user?.photoURL || ""} alt={user?.displayName || 'User'} />
                    <AvatarFallback className="rounded-lg">{getInitials(user?.displayName)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.displayName || 'Admin'}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email || 'admin@vatosalfa.com'}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/profile">
                      <User className="mr-2 h-4 w-4" />
                      <span>Mi Perfil</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar Sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div
        data-mobile-bottom-nav="true"
        className="md:hidden fixed bottom-0 left-0 w-screen max-w-[100vw] h-16 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-t border-[#2d3a60]/60 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.3)] backdrop-blur-md z-[100] flex items-center justify-around px-2 pb-safe pointer-events-auto"
      >
        {/* Haz de luz oblicuo animado idéntico a la franja azul superior */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="header-light-beam" />
        </div>

        {/* Tab 1: Agenda */}
        {canSee('ver_agenda') && (
          <Link
            href="/agenda"
            onClick={() => setIsMobileMenuOpen(false)}
            className={cn(
              "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
              pathname.startsWith('/agenda') && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Calendar className="h-5 w-5 mb-0.5" />
            <span className="text-[10px] font-semibold">Agenda</span>
          </Link>
        )}

        {/* Tab 2: Dynamic section based strictly on granted permissions */}
        {(() => {
          if (canSee('ver_ventas_facturadas')) {
            return (
              <Link
                href="/sales/invoiced"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname === '/sales/invoiced' && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <CreditCard className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] font-semibold">Facturadas</span>
              </Link>
            );
          }
          if (canSee('ver_clientes')) {
            return (
              <Link
                href="/clients"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname === '/clients' && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Users className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] font-semibold">Clientes</span>
              </Link>
            );
          }
          if (canSee('ver_promociones')) {
            return (
              <Link
                href="/promociones"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname.startsWith('/promociones') && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Gift className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] font-semibold">Promos</span>
              </Link>
            );
          }
          if (canSee('ver_inventario') || canSee('ver_productos')) {
            return (
              <Link
                href="/products"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname.startsWith('/products') && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Archive className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] font-semibold">Inventario</span>
              </Link>
            );
          }
          if (canSee('ver_conversaciones')) {
            return (
              <Link
                href="/conversations"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname.startsWith('/conversations') && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <div className="relative">
                  <MessageSquare className="h-5 w-5 mb-0.5" />
                  {pendingConversationsCount > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-xs",
                        humanRequestConversationsCount > 0 ? "bg-amber-500 animate-pulse" : "bg-blue-600"
                      )}
                    >
                      {pendingConversationsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold">Mensajes</span>
              </Link>
            );
          }
          return null;
        })()}

        {/* Tab 3: Center Floating Button - Nuevo con efecto oficial Vatos Alfa */}
        {(canSee('crear_reservas') || canSee('bloquear_horarios') || canSee('registrar_ventas')) && (
          <div className="flex items-center justify-center flex-1 h-full relative z-10 -translate-y-3.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="alfa"
                  size="icon"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-12 h-12 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_12px_rgba(59,130,246,0.3)] cursor-pointer"
                  aria-label="Acciones rápidas"
                >
                  <Plus className="h-6 w-6 text-white" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                side="top"
                className="w-56 mb-2 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5 z-[110]"
              >
                <DropdownMenuItem onSelect={() => { setIsMobileMenuOpen(false); dispatchCustomEvent('open-qr-scanner'); }} className="rounded-lg focus:bg-blue-500/20 cursor-pointer">
                  <QrCode className="mr-2 h-4 w-4 text-[#C5A880]" />
                  <span className="font-semibold text-[#C5A880]">Escanear QR cliente</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setIsMobileMenuOpen(false); dispatchCustomEvent('new-reservation'); }} disabled={!canSee('crear_reservas')} className="rounded-lg focus:bg-blue-500/20 cursor-pointer">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>Crear nueva reserva</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setIsMobileMenuOpen(false); dispatchCustomEvent('new-block'); }} disabled={!canSee('bloquear_horarios')} className="rounded-lg focus:bg-blue-500/20 cursor-pointer">
                  <Lock className="mr-2 h-4 w-4" />
                  <span>Bloquear horario</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setIsMobileMenuOpen(false); dispatchCustomEvent('new-sale'); }} disabled={!canSee('registrar_ventas')} className="rounded-lg focus:bg-blue-500/20 cursor-pointer">
                  <Tag className="mr-2 h-4 w-4" />
                  <span>Registrar nueva venta</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Tab 4: Caja / Mi Performance */}
        {(() => {
          if (canSee('ver_caja')) {
            return (
              <Link
                href="/sales/cash-box"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname === '/sales/cash-box' && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Wallet className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] font-semibold">Caja</span>
              </Link>
            );
          }
          if (canSee(['ver_mis_ventas', 'ver_mis_comisiones', 'ver_mis_propinas'])) {
            return (
              <Link
                href="/sales/my-performance"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                  pathname === '/sales/my-performance' && !isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <LineChart className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] font-semibold">Mi Perf.</span>
              </Link>
            );
          }
          return null;
        })()}

        {/* Tab 5: Más (Menu) */}
        <button
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className={cn(
            "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors cursor-pointer",
            isMobileMenuOpen ? "text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Menu className="h-5 w-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Más</span>
        </button>
      </div>
    </>
  );
}
