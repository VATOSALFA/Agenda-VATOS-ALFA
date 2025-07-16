
'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Calendar as CalendarIcon,
  Search,
  Plus,
  Minus,
  ArrowRightLeft,
  DollarSign,
  Download,
  MoreHorizontal,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mockSalesFlow = [
  {
    id: '44407-296',
    fecha_pago: '2025-07-15 20:19',
    local: 'VATOS ALFA Barber Shop',
    comprobante: '27885640',
    cliente: 'Carlos Zarco',
    detalle: 'Corte clásico y moderno',
    monto: 110,
    flujo: 110,
  },
  {
    id: '44406-829',
    fecha_pago: '2025-07-15 19:56',
    local: 'VATOS ALFA Barber Shop',
    comprobante: '8388bb9a95ec495fb86e',
    cliente: 'Mark Campos',
    detalle: 'Corte clásico y moderno',
    monto: 140,
    flujo: 140,
  },
  {
    id: '44406-051',
    fecha_pago: '2025-07-15 19:38',
    local: 'VATOS ALFA Barber Shop',
    comprobante: '3732243d2f448679acc',
    cliente: 'Gerardo Lopez Rueda',
    detalle: 'Corte clásico y moderno',
    monto: 140,
    flujo: 140,
  },
  {
    id: '44405-014',
    fecha_pago: '2025-07-15 19:27',
    local: 'VATOS ALFA Barber Shop',
    comprobante: 'dbfb653c7c054c7dbb02',
    cliente: 'Adrian Arzava',
    detalle: 'Renovación Alfa',
    monto: 310,
    flujo: 310,
  },
  {
    id: '44405-132',
    fecha_pago: '2025-07-15 19:04',
    local: 'VATOS ALFA Barber Shop',
    comprobante: 'ed152431a5454c6ab627',
    cliente: 'Sandra Sanchez',
    detalle: 'Corte clásico y moderno',
    monto: 180,
    flujo: 180,
  },
];

const SummaryCard = ({
  title,
  amount,
  action,
}: {
  title: string;
  amount: number;
  action?: 'plus' | 'minus';
}) => (
  <Card className="text-center bg-card/70">
    <CardContent className="p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-xl font-bold text-primary">
        ${amount.toLocaleString('es-CL')}
      </p>
      {action && (
        <Button size="icon" variant="outline" className="mt-2 h-6 w-6 rounded-full">
          {action === 'plus' ? (
            <Plus className="h-4 w-4" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
        </Button>
      )}
    </CardContent>
  </Card>
);

export default function CashBoxPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Caja de Ventas</h2>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-2 flex-grow min-w-[200px]">
            <label className="text-sm font-medium">Local</label>
            <Select defaultValue="vatos-alfa">
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar local" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vatos-alfa">
                  VATOS ALFA Barber Shop
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-grow min-w-[200px]">
            <label className="text-sm font-medium">Desde / Hasta</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={'outline'} className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? (
                    format(date, 'PPP', { locale: es })
                  ) : (
                    <span>Seleccionar fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button className="w-full sm:w-auto">
            <Search className="mr-2 h-4 w-4" /> Buscar
          </Button>
        </CardContent>
      </Card>

      {/* Main Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card text-card-foreground shadow-sm p-6">
        <h3 className="text-xl font-bold">VATOS ALFA Barber Shop</h3>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Efectivo en caja</p>
            <p className="text-4xl font-extrabold text-primary">$1,750</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Ingresos
            </Button>
            <Button variant="outline">
              <Minus className="mr-2 h-4 w-4" /> Egresos
            </Button>
            <Button variant="outline">
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Traspaso
            </Button>
          </div>
        </div>
      </div>
      
      {/* Detailed Summary */}
      <div className='bg-card p-4 rounded-lg border'>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard title="Ventas Facturadas" amount={83439} action="plus" />
            <SummaryCard title="Abonos" amount={0} />
            <SummaryCard title="Ventas Internas" amount={0} />
            <SummaryCard title="Otros Ingresos" amount={0} action="plus" />
            <SummaryCard title="Egresos" amount={0} action="minus" />
            <SummaryCard title="Resultado de Flujo del Periodo" amount={83439} />
          </div>
          <div className="flex justify-end mt-4">
             <Button variant="ghost" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Descargar reporte
            </Button>
          </div>
      </div>


      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle>Flujo De Ventas Facturadas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Fecha De Pago</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Monto Facturado</TableHead>
                <TableHead className="text-right">Flujo Del Periodo</TableHead>
                <TableHead className="text-right">Opciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockSalesFlow.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono text-xs">{sale.id}</TableCell>
                  <TableCell>{format(new Date(sale.fecha_pago), 'dd-MM-yyyy HH:mm')}</TableCell>
                  <TableCell>{sale.local}</TableCell>
                  <TableCell className="font-mono text-xs">{sale.comprobante}</TableCell>
                  <TableCell>{sale.cliente}</TableCell>
                  <TableCell>{sale.detalle}</TableCell>
                  <TableCell className="text-right font-medium">${sale.monto.toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right font-medium text-primary">${sale.flujo.toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Acciones <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem>Anular</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
