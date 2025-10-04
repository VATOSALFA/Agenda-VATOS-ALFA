
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import {
  Scissors,
  Calendar,
  Tag,
  Bell,
  Users,
  Box,
  BarChart2,
  Settings,
  Plus,
  CreditCard,
  UserPlus,
  Clock,
  Briefcase,
  Gift,
  DollarSign,
  ArrowRightLeft,
  Banknote,
  ChevronDown,
  Wallet,
  Lock,
  Archive,
  ShoppingCart,
  History,
  FileText,
  PieChart,
  LineChart,
  Store,
  MessageCircle,
  Percent,
  Globe,
  Copy,
  Share2,
  Landmark,
  LogOut,
  MessagesSquare,
  User,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Input } from '../ui/input';
import { useAuth } from '@/contexts/firebase-auth-context';


const mainNavLinks = [
  { href: '/', label: 'Agenda', icon: Calendar, permission: 'ver_agenda' },
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

interface EmpresaSettings {
    id?: string;
    logo_url?: string;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { user, signOut, db } = useAuth();
  const { data: empresaData } = useFirestoreQuery<EmpresaSettings>('empresa');
  const logoUrl = empresaData?.[0]?.logo_url;
  const [unreadCount, setUnreadCount] = useState(0);

  const isAuthPage = pathname === '/login';

  useEffect(() => {
    if (!db || !user) return;
    const q = query(
      collection(db, 'conversations'),
      where('unreadCount', '>', 0)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let totalUnread = 0;
      querySnapshot.forEach(doc => {
          totalUnread += doc.data().unreadCount;
      });
      setUnreadCount(totalUnread);
    });

    return () => unsubscribe();
  }, [db, user]);


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
        router.push('/login');
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
  
  const canSeeAny = (permissions: (string|undefined)[]) => {
      if (!user || !user.permissions) return false;
      if (user.role === 'Administrador general') return true;
      return permissions.some(p => p && user.permissions!.includes(p));
  }

  const dispatchCustomEvent = (eventName: string) => {
    document.dispatchEvent(new CustomEvent(eventName));
  }
  
  if (!user || isAuthPage) {
    return null;
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#202A49] border-b border-border/40 backdrop-blur-sm">
        <div className="flex h-16 items-center px-4 md:px-6">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            {logoUrl ? (
                <Image src={logoUrl} alt="Logo" width={125} height={60} className="h-[60px] w-auto" />
            ) : (
                <span className="font-bold text-lg text-white whitespace-nowrap">AGENDA VATOS ALFA</span>
            )}
          </Link>
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-sm font-medium">
            {mainNavLinks.map(({ href, label, permission }) => (
                canSee(permission) && (
                    <Link
                    key={href}
                    href={href}
                    className={cn(
                        'px-3 py-2 rounded-md transition-colors',
                        pathname === href
                        ? 'bg-white/10 text-white'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    )}
                    >
                    {label}
                    </Link>
                )
            ))}
            
            {canSeeAny(salesNavLinks.map(l => l.permission)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={cn(
                    'px-3 py-2 rounded-md transition-colors text-sm font-medium',
                    pathname.startsWith('/sales')
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  )}>
                    Ventas <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                    {salesNavLinks.map(({href, label, icon: Icon, permission}) => (
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
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  )}>
                    Productos <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                    {productsNavLinks.map(({href, label, icon: Icon, permission}) => (
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
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  )}>
                    Reportes <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  {reportsNavLinks.map(({href, label, icon: Icon, permission}) => (
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
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
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

            {canSee('ver_administracion') && (
              <Link
                href="/admin"
                className={cn(
                  'px-3 py-2 rounded-md transition-colors text-sm font-medium',
                  pathname.startsWith('/admin')
                    ? 'bg-white/10 text-white'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                )}
              >
                Administración
              </Link>
            )}

          </nav>
          <div className="ml-auto flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="bg-[#314177] hover:bg-[#40538a] text-white">
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

             {canSee('ver_conversaciones') && (
                <Link href="/admin/conversations" passHref>
                    <Button variant="ghost" size="icon" className="text-gray-300 hover:bg-white/10 hover:text-white relative">
                        <MessagesSquare className="h-5 w-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                                {unreadCount}
                            </span>
                        )}
                    </Button>
                </Link>
             )}
            
            {canSee('ver_configuracion') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                   <Button variant="ghost" size="icon" className="text-gray-300 hover:bg-white/10 hover:text-white">
                      <Settings className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Configuraciones</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                      <Link href="/settings/users">
                          <Users className="mr-2 h-4 w-4" />
                          <span>Usuarios y permisos</span>
                      </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-transparent text-gray-300 border-gray-500 hover:bg-white/10 hover:text-white hover:border-white/80">
                  <Globe className="mr-2 h-4 w-4" />
                  Sitio web
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-4">
                 <div className="space-y-2">
                    <p className="font-semibold text-sm">¡Comparte tu link y recibe citas!</p>
                     <div className="flex items-center space-x-2">
                        <Input readOnly value={websiteUrl} className="flex-1 text-xs h-9" />
                        <Button size="icon" className="h-9 w-9" onClick={copyToClipboard}><Copy className="h-4 w-4" /></Button>
                    </div>
                 </div>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem asChild>
                    <a href={`https://${websiteUrl}`} target="_blank" rel="noopener noreferrer" className="flex items-center">
                        <Share2 className="mr-2 h-4 w-4" />
                        <span>Ir a mi sitio web</span>
                    </a>
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.avatarUrl || ""} alt={user?.displayName || 'User'} />
                    <AvatarFallback>{getInitials(user?.displayName)}</AvatarFallback>
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
                     <DropdownMenuItem asChild>
                        <Link href="/settings/empresa">
                            <Landmark className="mr-2 h-4 w-4" />
                            <span>Mi Negocio</span>
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
