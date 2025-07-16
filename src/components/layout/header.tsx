
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
  Share2
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

const adminNavLinks = [
    { href: '/admin/locales', label: 'Locales', icon: Store },
    { href: '/admin/profesionales', label: 'Profesionales', icon: Users },
    { href: '/admin/servicios', label: 'Servicios', icon: Scissors },
    { href: '/admin/whatsapp', label: 'Whatsapp', icon: MessageCircle },
    { href: '/admin/comisiones', label: 'Comisiones', icon: Percent },
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
            <Scissors className="h-6 w-6 text-white" />
            <span className="font-bold text-lg text-white">VATOS ALFA</span>
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
                  pathname.startsWith('/admin')
                     ? 'bg-white/10 text-white'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                )}>
                  Administración <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                {adminNavLinks.map(({href, label, icon: Icon}) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href}>
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
            
            <Button variant="ghost" size="icon" className="text-gray-300 hover:bg-white/10 hover:text-white">
                <Settings className="h-5 w-5" />
            </Button>
            
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
                    <Link href="#">
                        <Share2 className="mr-2 h-4 w-4" />
                        <span>Ir a mi sitio web</span>
                    </Link>
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
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Users className="mr-2 h-4 w-4" />
                    <span>Perfil</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configuración</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
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
