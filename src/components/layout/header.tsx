
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
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
import { useFeatures } from '@/hooks/use-features';
import { useMemo } from 'react';
import { useNetworkStatus } from '@/hooks/use-network-status';

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

  const professionalId = useMemo(() => {
    if (!user?.uid || allProfessionals.length === 0) return user?.uid;
    const match = allProfessionals.find((p: any) => p.userId === user.uid);
    return match ? match.id : user.uid;
  }, [user?.uid, allProfessionals]);

  const mainNavLinks = useMemo(() => [
    ...(enableBarberDashboard ? [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'ver_agenda' }] : []),
    { href: '/agenda', label: 'Agenda', icon: Calendar, permission: 'ver_agenda' },
    { href: '/clients', label: 'Clientes', icon: Users, permission: 'ver_clientes' },
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-primary border-b border-border/40 backdrop-blur-sm">
        <div className="flex h-16 items-center px-4 md:px-6">

          {!isOnline && (
            <div className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-bold mr-4 flex items-center animate-pulse">
              <WifiOff className="h-3 w-3 mr-1" />
              OFFLINE
            </div>
          )}

          {/* Mobile Menu (controlled via bottom navigation) */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetContent side="right" className="w-full max-w-full sm:max-w-full h-full border-none bg-[#151b2e] text-white pl-6 pt-6 pb-6 pr-1 [&>button]:hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>Opciones Secundarias</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-full pr-1">
                <div className="flex justify-end mb-6 mt-2 pr-5">
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    aria-label="Cerrar menú"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-6 pb-24 pr-5">
                    {/* Website links group */}
                    {websiteGroupLinks.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                          Sitio Web
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
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
                                onClick={handleOpen}
                                className="relative flex flex-col items-center justify-center p-3 rounded-xl border bg-[#1f2742] border-[#314177]/40 hover:border-[#314177] hover:shadow-[0_0_12px_rgba(49,65,119,0.3)] group cursor-pointer h-20"
                              >
                                <button
                                  onClick={handleCopy}
                                  className="absolute top-1.5 right-1.5 p-1 rounded bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors z-10"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <link.icon className="h-5 w-5 text-blue-300 mb-1.5 group-hover:scale-110 transition-transform duration-300" />
                                <span className="text-[10px] font-semibold text-gray-200 text-center leading-tight">{link.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Filtered Categories */}
                    {filteredMenuGroups.map((group) => (
                      <div key={group.title}>
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                          {group.title}
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {group.links.map((link) => {
                            const Icon = link.icon;
                            const isActive = pathname === link.href || (link.href === '/agenda' && pathname.startsWith('/agenda'));
                            return (
                              <Link
                                key={link.href}
                                href={link.href}
                                onClick={handleLinkClick}
                                className={cn(
                                  "flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 h-20",
                                  "bg-[#1f2742] border-[#314177]/40 hover:border-[#314177] hover:shadow-[0_0_12px_rgba(49,65,119,0.3)] group",
                                  isActive && "border-[#314177] bg-[#1f2742] shadow-[0_0_12px_rgba(49,65,119,0.4)]"
                                )}
                              >
                                <Icon className="h-5 w-5 text-blue-300 mb-1.5 group-hover:scale-110 transition-transform duration-300" />
                                <span className="text-[10px] font-semibold text-gray-200 text-center leading-tight">{link.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

          <Link href="/agenda" className="mr-4 flex items-center flex-shrink-0">
            <div className="relative h-14 w-32 md:w-40 lg:w-52">
              <Image
                src="/logo-header-blanco.png"
                alt="VATOS ALFA"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </Link>
          <nav className="hidden md:flex items-center min-w-0 flex-1 text-sm font-medium">
            {mainNavLinks.map(({ href, label, permission }) => {
              const isActive = (pathname === href) || (href === '/agenda' && pathname.startsWith('/agenda'));
              return (
                canSee(permission) && (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'px-2 lg:px-3 py-2 rounded-md transition-colors text-xs lg:text-sm whitespace-nowrap',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                    )}
                  >
                    {label}
                  </Link>
                )
              )
            })}

            {canSeeAny(salesNavLinks.map(l => l.permission)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-2 lg:px-3 py-2 rounded-md transition-colors text-xs lg:text-sm font-medium whitespace-nowrap',
                    pathname.startsWith('/sales')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Ventas <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
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
                    'px-2 lg:px-3 py-2 rounded-md transition-colors text-xs lg:text-sm font-medium whitespace-nowrap',
                    pathname.startsWith('/products')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Productos <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
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
                    'px-2 lg:px-3 py-2 rounded-md transition-colors text-xs lg:text-sm font-medium whitespace-nowrap',
                    pathname.startsWith('/reports')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Reportes <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
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
                    'px-2 lg:px-3 py-2 rounded-md transition-colors text-xs lg:text-sm font-medium whitespace-nowrap',
                    pathname.startsWith('/finanzas')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Finanzas <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
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
                    'px-2 lg:px-3 py-2 rounded-md transition-colors text-xs lg:text-sm font-medium whitespace-nowrap',
                    pathname.startsWith('/admin')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Administración <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
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
              <div className="ml-1 lg:ml-2 flex items-center">
                <Link
                  href="/promociones"
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs lg:text-sm whitespace-nowrap font-bold text-white shadow-md transform hover:scale-105 active:scale-95 duration-200 border flex items-center gap-1.5 animate-gradient-flow bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-500 hover:shadow-lg transition-all',
                    pathname === '/promociones'
                      ? 'border-white ring-2 ring-white/20 shadow-purple-500/40 scale-105'
                      : 'border-white/20 hover:border-white/50'
                  )}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </span>
                  Promociones
                </Link>
              </div>
            )}

          </nav>
          <div className="ml-auto flex items-center space-x-1.5 flex-shrink-0">
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary">
                    Nuevo
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-reservation')} disabled={!canSee('crear_reservas')}>
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>Crear nueva reserva</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-block')} disabled={!canSee('bloquear_horarios')}>
                    <Lock className="mr-2 h-4 w-4" />
                    <span>Bloquear horario</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-sale')} disabled={!canSee('registrar_ventas')}>
                    <Tag className="mr-2 h-4 w-4" />
                    <span>Registrar nueva venta</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="sm" className="hidden sm:flex">
                  <Globe className="mr-2 h-4 w-4" />
                  Web
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
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



            {user?.role === 'Administrador general' && (
              <Link href="/settings/empresa" passHref>
                <Button variant="ghost" size="icon" className="text-gray-300 hover:bg-black/10 hover:text-primary-foreground">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
            )}

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
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#151b2e] border-t border-[#314177]/30 backdrop-blur-md z-50 flex items-center justify-around px-2 pb-safe">
        {/* Tab 1: Agenda */}
        <Link
          href="/agenda"
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
            pathname.startsWith('/agenda') ? "text-blue-300" : "text-gray-400 hover:text-gray-200"
          )}
        >
          <Calendar className="h-5 w-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Agenda</span>
        </Link>

        {/* Tab 2: Ventas Facturadas (fallback to Clientes) */}
        <Link
          href={canSee('ver_ventas_facturadas') ? '/sales/invoiced' : '/clients'}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
            ((canSee('ver_ventas_facturadas') && pathname === '/sales/invoiced') || (!canSee('ver_ventas_facturadas') && pathname === '/clients')) ? "text-blue-300" : "text-gray-400 hover:text-gray-200"
          )}
        >
          {canSee('ver_ventas_facturadas') ? <CreditCard className="h-5 w-5 mb-0.5" /> : <Users className="h-5 w-5 mb-0.5" />}
          <span className="text-[10px] font-semibold">
            {canSee('ver_ventas_facturadas') ? 'Facturadas' : 'Clientes'}
          </span>
        </Link>

        {/* Tab 3: Center Floating Button - Nuevo */}
        <div className="flex items-center justify-center flex-1 h-full relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-[#202a49] to-[#3c4f90] text-white shadow-[0_0_12px_rgba(49,65,119,0.5)] border border-white/10 active:scale-95 duration-200 -translate-y-4">
                <Plus className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="w-56 mb-2">
              <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-reservation')} disabled={!canSee('crear_reservas')}>
                <Calendar className="mr-2 h-4 w-4" />
                <span>Crear nueva reserva</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-block')} disabled={!canSee('bloquear_horarios')}>
                <Lock className="mr-2 h-4 w-4" />
                <span>Bloquear horario</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => dispatchCustomEvent('new-sale')} disabled={!canSee('registrar_ventas')}>
                <Tag className="mr-2 h-4 w-4" />
                <span>Registrar nueva venta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tab 4: Caja / Mi Performance */}
        <Link
          href={canSee('ver_caja') ? '/sales/cash-box' : '/sales/my-performance'}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
            (pathname === '/sales/cash-box' || pathname === '/sales/my-performance') ? "text-blue-300" : "text-gray-400 hover:text-gray-200"
          )}
        >
          {canSee('ver_caja') ? <Wallet className="h-5 w-5 mb-0.5" /> : <LineChart className="h-5 w-5 mb-0.5" />}
          <span className="text-[10px] font-semibold">{canSee('ver_caja') ? 'Caja' : 'Mi Perf.'}</span>
        </Link>

        {/* Tab 5: Más (Menu) */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
            isMobileMenuOpen ? "text-blue-300" : "text-gray-400 hover:text-gray-200"
          )}
        >
          <Menu className="h-5 w-5 mb-0.5" />
          <span className="text-[10px] font-semibold">Más</span>
        </button>
      </div>
    </>
  );
}
