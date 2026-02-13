
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
import { Input } from '../ui/input';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExternalLink } from 'lucide-react';

const mainNavLinks = [
  { href: '/agenda', label: 'Agenda', icon: Calendar, permission: 'ver_agenda' },
  { href: '/clients', label: 'Clientes', icon: Users, permission: 'ver_clientes' },
];

const salesNavLinks = [
  { href: '/sales/invoiced', label: 'Ventas Facturadas', icon: CreditCard, permission: 'ver_ventas_facturadas' },
  { href: '/sales/commissions', label: 'Reporte de Comisiones', icon: DollarSign, permission: 'ver_reporte_comisiones' },
  { href: '/sales/cash-box', label: 'Caja de Ventas', icon: Banknote, permission: 'ver_caja' },
  { href: '/sales/tips', label: 'Propinas', icon: Gift, permission: 'ver_propinas' },
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
];

const finanzasNavLinks = [
  { href: '/finanzas/resumen', label: 'Resumen', permission: 'ver_finanzas' },
  { isSeparator: true },
  { href: '/finanzas/enero', label: 'Enero', permission: 'ver_finanzas' },
  { href: '/finanzas/febrero', label: 'Febrero', permission: 'ver_finanzas' },
  { href: '/finanzas/marzo', label: 'Marzo', permission: 'ver_finanzas' },
  { href: '/finanzas/abril', label: 'Abril', permission: 'ver_finanzas' },
  { href: '/finanzas/mayo', label: 'Mayo', permission: 'ver_finanzas' },
  { href: '/finanzas/junio', label: 'Junio', permission: 'ver_finanzas' },
  { href: '/finanzas/julio', label: 'Julio', permission: 'ver_finanzas' },
  { href: '/finanzas/agosto', label: 'Agosto', permission: 'ver_finanzas' },
  { href: '/finanzas/septiembre', label: 'Septiembre', permission: 'ver_finanzas' },
  { href: '/finanzas/octubre', label: 'Octubre', permission: 'ver_finanzas' },
  { href: '/finanzas/noviembre', label: 'Noviembre', permission: 'ver_finanzas' },
  { href: '/finanzas/diciembre', label: 'Diciembre', permission: 'ver_finanzas' },
];

const adminNavLinks = [
  { href: '/admin/profesionales', label: 'Profesionales', icon: Users, permission: 'ver_profesionales' },
  { href: '/admin/servicios', label: 'Servicios', icon: Scissors, permission: 'ver_servicios' },
  { href: '/admin/comisiones', label: 'Comisiones', icon: Percent, permission: 'ver_comisiones' },
];

export default function Header() {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, signOut, db } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: empresaData } = useFirestoreQuery<any>('empresa');

  // Get website URL from settings or fallback to current origin
  const configuredWebsiteUrl = empresaData?.[0]?.website_slug;
  const displayUrl = configuredWebsiteUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  const isAuthPage = pathname === '/login';
  const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/privacidad' || pathname === '/terminos';

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

  const canSee = (permission: string) => {
    if (!user || !user.permissions) return false;
    // Admin always has all permissions
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }

  const canSeeAny = (permissions: (string | undefined)[]) => {
    if (!user || !user.permissions) return false;
    if (user.role === 'Administrador general') return true;
    return permissions.some(p => p && user.permissions!.includes(p));
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

          {/* Mobile Menu Trigger */}
          <div className="md:hidden mr-2">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[400px] p-0 [&>button]:text-white hover:[&>button]:text-white/80">
                <SheetHeader className="p-4 bg-primary text-primary-foreground">
                  <SheetTitle className="text-white flex items-center gap-2">
                    <img src="/logo-header-blanco.png" alt="VATOS ALFA" className="h-8 w-auto object-contain" />
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-64px)]">
                  <div className="flex flex-col gap-1 p-4 pb-16">
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="website" className="border-b-0">
                        <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                          Sitio Web
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pt-2 pb-2">
                            <div className="rounded-md border bg-muted/30 p-3">
                              <p className="mb-3 break-all text-xs text-muted-foreground">
                                {displayUrl}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 flex-1 text-xs"
                                  onClick={() => {
                                    if (displayUrl) window.open(displayUrl, '_blank');
                                  }}
                                >
                                  <ExternalLink className="mr-2 h-3 w-3" />
                                  Visitar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(displayUrl);
                                    toast({
                                      title: 'Link copiado',
                                      description: 'El enlace se ha copiado al portapapeles.',
                                    });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="main" className="border-b-0">
                        <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                          Menú Principal
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="flex flex-col space-y-1 pt-1">
                            {mainNavLinks.map(({ href, label, icon: Icon, permission }) => (
                              canSee(permission) && (
                                <Link
                                  key={href}
                                  href={href}
                                  onClick={handleLinkClick}
                                  className={cn(
                                    'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                    (pathname === href) || (href === '/agenda' && pathname.startsWith('/agenda'))
                                      ? 'bg-primary/10 text-primary'
                                      : 'text-foreground hover:bg-muted'
                                  )}
                                >
                                  <Icon className="mr-3 h-4 w-4" />
                                  {label}
                                </Link>
                              )
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {canSeeAny(salesNavLinks.map(l => l.permission)) && (
                        <AccordionItem value="sales" className="border-b-0">
                          <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                            Ventas
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col space-y-1 pt-1">
                              {salesNavLinks.map(({ href, label, icon: Icon, permission }) => (
                                canSee(permission!) && (
                                  <Link
                                    key={href}
                                    href={href!}
                                    onClick={handleLinkClick}
                                    className={cn(
                                      'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                      pathname === href
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                    )}
                                  >
                                    <Icon className="mr-3 h-4 w-4" />
                                    {label}
                                  </Link>
                                )
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {canSeeAny(productsNavLinks.map(l => l.permission)) && (
                        <AccordionItem value="products" className="border-b-0">
                          <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                            Productos
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col space-y-1 pt-1">
                              {productsNavLinks.map(({ href, label, icon: Icon, permission }) => (
                                canSee(permission!) && (
                                  <Link
                                    key={href}
                                    href={href!}
                                    onClick={handleLinkClick}
                                    className={cn(
                                      'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                      pathname === href
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                    )}
                                  >
                                    <Icon className="mr-3 h-4 w-4" />
                                    {label}
                                  </Link>
                                )
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {canSeeAny(reportsNavLinks.map(l => l.permission)) && (
                        <AccordionItem value="reports" className="border-b-0">
                          <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                            Reportes
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col space-y-1 pt-1">
                              {reportsNavLinks.map(({ href, label, icon: Icon, permission }) => (
                                canSee(permission!) && (
                                  <Link
                                    key={href}
                                    href={href!}
                                    onClick={handleLinkClick}
                                    className={cn(
                                      'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                      pathname === href
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                    )}
                                  >
                                    <Icon className="mr-3 h-4 w-4" />
                                    {label}
                                  </Link>
                                )
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {canSee('ver_finanzas') && (
                        <AccordionItem value="finances" className="border-b-0">
                          <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                            Finanzas
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col space-y-1 pt-1">
                              {finanzasNavLinks.map((item, index) => (
                                !item.isSeparator && canSee(item.permission!) && (
                                  <Link
                                    key={item.href}
                                    href={item.href!}
                                    onClick={handleLinkClick}
                                    className={cn(
                                      'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                      pathname === item.href
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                    )}
                                  >
                                    <span className="ml-7">{item.label}</span>
                                  </Link>
                                )
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {canSeeAny(['ver_administracion', 'ver_profesionales', 'ver_servicios', 'ver_comisiones']) && (
                        <AccordionItem value="admin" className="border-b-0">
                          <AccordionTrigger className="py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                            Administración
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-col space-y-1 pt-1">
                              {adminNavLinks.map(({ href, label, icon: Icon, permission }) => (
                                (canSee(permission!) || canSee('ver_administracion')) && (
                                  <Link
                                    key={href}
                                    href={href!}
                                    onClick={handleLinkClick}
                                    className={cn(
                                      'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                      pathname === href
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                    )}
                                  >
                                    <Icon className="mr-3 h-4 w-4" />
                                    {label}
                                  </Link>
                                )
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>

          <Link href="/agenda" className="mr-6 flex items-center">
            <div className="relative h-14 w-32 md:w-64">
              <Image
                src="/logo-header-blanco.png"
                alt="VATOS ALFA"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </Link>
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-sm font-medium">
            {mainNavLinks.map(({ href, label, permission }) => {
              const isActive = (pathname === href) || (href === '/agenda' && pathname.startsWith('/agenda'));
              return (
                canSee(permission) && (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'px-3 py-2 rounded-md transition-colors',
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
                    'px-3 py-2 rounded-md transition-colors text-sm font-medium',
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
                    'px-3 py-2 rounded-md transition-colors text-sm font-medium',
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
                    'px-3 py-2 rounded-md transition-colors text-sm font-medium',
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
                    'px-3 py-2 rounded-md transition-colors text-sm font-medium',
                    pathname.startsWith('/finanzas')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Finanzas <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  {finanzasNavLinks.map((item, index) => (
                    item.isSeparator ? (
                      <DropdownMenuSeparator key={`sep-${index}`} />
                    ) : (
                      canSee(item.permission!) && (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link href={item.href!}>
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      )
                    )
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canSeeAny(['ver_administracion', 'ver_profesionales', 'ver_servicios', 'ver_comisiones']) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-3 py-2 rounded-md transition-colors text-sm font-medium',
                    pathname.startsWith('/admin')
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-gray-300 hover:bg-black/10 hover:text-primary-foreground'
                  )}>
                    Administración <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  {adminNavLinks.map(({ href, label, icon: Icon, permission }) => (
                    (canSee(permission!) || canSee('ver_administracion')) && (
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

          </nav>
          <div className="ml-auto flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary">
                  <Plus className="mr-2 h-4 w-4" /> Nuevo
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

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="sm" className="hidden sm:flex">
                  <Globe className="mr-2 h-4 w-4" />
                  Sitio web
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="flex flex-col space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold leading-none">¡Comparte tu link y recibe citas!</h4>
                    <p className="text-xs text-muted-foreground break-all">
                      {displayUrl}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => {
                      if (displayUrl) window.open(displayUrl, '_blank');
                    }}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Ir a mi sitio web
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => {
                      navigator.clipboard.writeText(displayUrl);
                      toast({ title: "Link copiado", description: "El enlace se ha copiado al portapapeles." });
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
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
    </>
  );
}
