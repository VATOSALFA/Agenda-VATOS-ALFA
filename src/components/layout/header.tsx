
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { NewSaleSheet } from '../sales/new-sale-sheet';
import { useToast } from '@/hooks/use-toast';
import { Input } from '../ui/input';


const mainNavLinks = [
  { href: '/', label: 'Agenda', icon: Calendar },
  { href: '/reminders', label: 'Recordatorios', icon: Bell },
  { href: '/clients', label: 'Clientes', icon: Users },
];

const salesNavLinks = [
    { href: '/sales/invoiced', label: 'Ventas Facturadas', icon: CreditCard },
    { href: '/sales/commissions', label: 'Reporte de Comisiones', icon: DollarSign },
    { href: '/sales/cash-box', label: 'Caja de Ventas', icon: Banknote },
    { href: '/sales/tips', label: 'Propinas', icon: Gift },
    { href: '/sales/payments', label: 'Pagos y Transferencias', icon: ArrowRightLeft },
]

const productsNavLinks = [
  { href: '/products', label: 'Inventario', icon: Archive },
  { href: '/products/sales', label: 'Venta de productos', icon: ShoppingCart },
  { href: '/products/stock-movement', label: 'Movimiento de stock', icon: History },
];

const reportsNavLinks = [
  { href: '/reports', label: 'Resumen', icon: PieChart },
  { href: '/reports/reservations', label: 'Reporte de reservas', icon: FileText },
  { href: '/reports/sales', label: 'Reporte de ventas', icon: LineChart },
];

const finanzasNavLinks = [
  { href: '/finanzas/resumen', label: 'Resumen' },
  { isSeparator: true },
  { href: '/finanzas/enero', label: 'Enero' },
  { href: '/finanzas/febrero', label: 'Febrero' },
  { href: '/finanzas/marzo', label: 'Marzo' },
  { href: '/finanzas/abril', label: 'Abril' },
  { href: '/finanzas/mayo', label: 'Mayo' },
  { href: '/finanzas/junio', label: 'Junio' },
  { href: '/finanzas/julio', label: 'Julio' },
  { href: '/finanzas/agosto', label: 'Agosto' },
  { href: '/finanzas/septiembre', label: 'Septiembre' },
  { href: '/finanzas/octubre', label: 'Octubre' },
  { href: '/finanzas/noviembre', label: 'Noviembre' },
  { href: '/finanzas/diciembre', label: 'Diciembre' },
];

export default function Header() {
  const pathname = usePathname();
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const { toast } = useToast();

  const websiteUrl = 'vatosalfabarbershop.site.agendapro.co';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(websiteUrl);
    toast({
      title: '¡Copiado!',
      description: 'El enlace a tu sitio web ha sido copiado al portapapeles.',
    });
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#202A49] border-b border-border/40 backdrop-blur-sm">
        <div className="flex h-16 items-center px-4 md:px-6">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <svg viewBox="0 0 165 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-auto">
                <path d="M52.331 43.14L41.363 19.98H45.203L53.747 38.388L53.915 38.388L62.543 19.98H66.215L55.331 43.14H52.331Z" fill="white"/>
                <path d="M68.6146 43.14V19.98H72.0386V36.3H79.8746V38.868H72.0386V40.452C72.0386 41.508 72.4106 42.06 73.1546 42.06C73.8986 42.06 74.4506 41.676 74.8226 41.208L76.6106 43.14C75.8666 43.8 74.8226 44.22 73.5266 44.22C71.5946 44.22 70.1826 43.224 69.4386 41.292L68.6146 43.14Z" fill="white"/>
                <path d="M96.0691 40.536L92.2291 33.48L95.5351 27.684L91.6111 19.98H87.1951L90.7591 29.832L84.8431 40.092L82.1311 35.076L85.6111 27.852L81.7711 19.98H77.2711L82.8991 32.556L88.9831 43.14H92.5471L96.0691 40.536Z" fill="white"/>
                <path d="M106.634 36.3H98.798V43.14H95.374V19.98H106.378C108.682 19.98 110.136 20.892 110.136 22.824C110.136 24.324 109.392 25.236 108.054 25.746V25.914C109.842 26.298 110.976 27.294 110.976 29.1C110.976 31.404 109.11 32.58 106.378 32.58H98.798V28.908H105.742C107.154 28.908 107.898 28.224 107.898 27.312C107.898 26.316 107.026 25.632 105.574 25.632H98.798V23.328H105.406C106.744 23.328 107.446 22.776 107.446 22.032C107.446 21.246 106.786 20.736 105.532 20.736H98.798V36.3H106.634Z" fill="white"/>
                <path d="M116.324 23.286C115.856 21.354 114.356 19.98 112.01 19.98C109.382 19.98 107.408 22.11 107.408 25.374V37.764C107.408 41.028 109.382 43.14 112.01 43.14C114.356 43.14 115.856 41.778 116.324 39.846H112.984C112.654 40.572 112.144 40.914 111.484 40.914C110.452 40.914 109.842 40.128 109.842 38.346V24.768C109.842 22.986 110.452 22.2 111.484 22.2C112.144 22.2 112.654 22.542 112.984 23.286H116.324Z" fill="white"/>
                <path d="M129.544 19.98L124.96 32.424L120.376 19.98H116.14L123.514 36.936V43.14H126.778V36.936L134.152 19.98H129.544Z" fill="white"/>
                <path d="M136.913 43.14V19.98H140.337V36.3H148.173V38.868H140.337V40.452C140.337 41.508 140.709 42.06 141.453 42.06C142.197 42.06 142.749 41.676 143.121 41.208L144.909 43.14C144.165 43.8 143.121 44.22 141.825 44.22C139.893 44.22 138.481 43.224 137.737 41.292L136.913 43.14Z" fill="white"/>
                <path d="M149.771 43.14V19.98H152.939V43.14H149.771Z" fill="white"/>
                <path d="M8.28859 19.344C8.28859 16.596 9.42259 14.58 11.6426 14.58C13.8626 14.58 15.0386 16.596 15.0386 19.344C15.0386 22.092 13.8626 24.108 11.6426 24.108C9.42259 24.108 8.28859 22.092 8.28859 19.344ZM30.4886 19.344C30.4886 16.596 31.6226 14.58 33.8426 14.58C36.0626 14.58 37.2386 16.596 37.2386 19.344C37.2386 22.092 36.0626 24.108 33.8426 24.108C31.6226 24.108 30.4886 22.092 30.4886 19.344ZM11.6846 43.14L18.4286 27.6C17.5586 26.856 16.9466 26.244 16.4366 25.548C16.4366 25.548 16.2686 25.338 16.1426 25.146L15.9326 24.87C16.1006 24.786 16.2686 24.702 16.4366 24.618L21.7586 43.14H18.5906L15.2426 33.816L11.8946 43.14H8.72659L1.98259 27.6C2.85259 26.856 3.46459 26.244 3.97459 25.548C3.97459 25.548 4.14259 25.338 4.26859 25.146L4.47859 24.87C4.31059 24.786 4.14259 24.702 3.97459 24.618L-1.34741 43.14H-4.51541L5.56859 19.98H8.77859L11.6846 25.83L14.5906 19.98H17.8006L27.8846 43.14H24.7166L21.3686 33.816L18.0206 43.14H14.8526L11.6846 43.14Z" fill="white"/>
                <rect x="0.5" y="49.5" width="44" height="1" fill="white"/>
                <rect x="156.5" y="49.5" width="44" height="1" fill="white"/>
                <path d="M49 50L53.5 45.5" stroke="white"/>
                <path d="M152 50L147.5 45.5" stroke="white"/>
                <path d="M49 50L53.5 54.5" stroke="white"/>
                <path d="M152 50L147.5 54.5" stroke="white"/>
                <foreignObject x="58" y="46" width="85" height="15">
                    <p style={{fontSize: '6px', color: 'white', textAlign: 'center', fontWeight: 'bold'}}>BARBER SHOP</p>
                </foreignObject>
            </svg>
            <span className="font-bold text-lg text-white whitespace-nowrap">VATOS ALFA</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-sm font-medium">
            <Link
              href="/"
              className={cn(
                'px-3 py-2 rounded-md transition-colors',
                pathname === '/'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
            >
              Agenda
            </Link>
            
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
                  {salesNavLinks.map(({href, label, icon: Icon}) => (
                      <DropdownMenuItem key={href} asChild>
                          <Link href={href}>
                              <Icon className="mr-2 h-4 w-4" />
                              <span>{label}</span>
                          </Link>
                      </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {mainNavLinks.filter(l => !['/', '/products', '/reports'].includes(l.href)).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-3 py-2 rounded-md transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-white/10 text-white'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                )}
              >
                {label}
              </Link>
            ))}

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
                  {productsNavLinks.map(({href, label, icon: Icon}) => (
                      <DropdownMenuItem key={href} asChild>
                          <Link href={href}>
                              <Icon className="mr-2 h-4 w-4" />
                              <span>{label}</span>
                          </Link>
                      </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

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
                {reportsNavLinks.map(({href, label, icon: Icon}) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href}>
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

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
                {finanzasNavLinks.map((item) => (
                    item.isSeparator ? (
                        <DropdownMenuSeparator key="separator" />
                    ) : (
                        <DropdownMenuItem key={item.href} asChild>
                            <Link href={item.href!}>
                                <span>{item.label}</span>
                            </Link>
                        </DropdownMenuItem>
                    )
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link
              href="/admin/profesionales"
              className={cn(
                'px-3 py-2 rounded-md transition-colors text-sm font-medium',
                pathname.startsWith('/admin')
                  ? 'bg-white/10 text-white'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
            >
              Administración
            </Link>

          </nav>
          <div className="ml-auto flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="bg-[#314177] hover:bg-[#40538a] text-white">
                  <Plus className="mr-2 h-4 w-4" /> Nuevo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setIsReservationModalOpen(true)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>Crear nueva reserva</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsBlockScheduleModalOpen(true)}>
                  <Lock className="mr-2 h-4 w-4" />
                  <span>Bloquear horario</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsSaleSheetOpen(true)}>
                  <Tag className="mr-2 h-4 w-4" />
                  <span>Registrar nueva venta</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
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
                        <span>Usuarios</span>
                    </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
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
                    <AvatarImage src="https://placehold.co/100x100" alt="@vatosalfa" data-ai-hint="man portrait" />
                    <AvatarFallback>VA</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Admin</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      admin@vatosalfa.com
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <span>Cerrar Sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <NewReservationForm onFormSubmit={() => setIsReservationModalOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={isBlockScheduleModalOpen} onOpenChange={setIsBlockScheduleModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <BlockScheduleForm onFormSubmit={() => setIsBlockScheduleModalOpen(false)} />
        </DialogContent>
      </Dialog>
      <NewSaleSheet isOpen={isSaleSheetOpen} onOpenChange={setIsSaleSheetOpen} />
    </>
  );
}
