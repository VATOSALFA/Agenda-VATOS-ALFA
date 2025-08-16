
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, Search, Download, Eye, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CashClosing, User as AppUser } from '@/lib/types';
import { where, Timestamp, QueryConstraint } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const ClosingDetailModal = ({ closing, isOpen, onOpenChange }: { closing: CashClosing | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
  if (!closing) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle del Cierre de Caja #{closing.id.slice(0, 6)}</DialogTitle>
          <DialogDescription>
            Realizado el {format(closing.fecha_corte.toDate(), "dd 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6 py-4">
            <div>
                <h4 className="font-semibold mb-2">Resumen</h4>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Entregado por:</span> <span className="font-medium">{closing.persona_entrega_nombre}</span></div>
                    <div className="flex justify-between"><span>Recibido por:</span> <span className="font-medium">{closing.persona_recibe}</span></div>
                    <div className="flex justify-between border-t pt-2 mt-2"><span>Total en sistema:</span> <span className="font-medium">${closing.total_sistema.toLocaleString('es-CL')}</span></div>
                    <div className="flex justify-between"><span>Fondo base:</span> <span className="font-medium">${closing.fondo_base.toLocaleString('es-CL')}</span></div>
                    <div className="flex justify-between"><span>Total contado:</span> <span className="font-medium">${closing.total_calculado.toLocaleString('es-CL')}</span></div>
                    <div className={cn("flex justify-between font-bold", closing.diferencia !== 0 ? 'text-destructive' : 'text-green-600')}><span>Diferencia:</span> <span>${closing.diferencia.toLocaleString('es-CL')}</span></div>
                    <div className="pt-2">
                        <h5 className="font-semibold">Comentarios:</h5>
                        <p className="text-muted-foreground">{closing.comentarios || 'Sin comentarios.'}</p>
                    </div>
                </div>
            </div>
            <div>
                <h4 className="font-semibold mb-2">Desglose de efectivo</h4>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Denominación</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.entries(closing.detalle_conteo).map(([value, count]) => (
                            <TableRow key={value}>
                                <TableCell>${Number(value).toLocaleString('es-CL')}</TableCell>
                                <TableCell className="text-right">{count}</TableCell>
                                <TableCell className="text-right">${(Number(value) * count).toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


export default function CashClosingsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [deliveredByFilter, setDeliveredByFilter] = useState('todos');
  const [receivedByFilter, setReceivedByFilter] = useState('todos');
  const [queryKey, setQueryKey] = useState(0);
  const [selectedClosing, setSelectedClosing] = useState<CashClosing | null>(null);

  const { data: users, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios');

  const queryConstraints = useMemo(() => {
    const constraints: QueryConstraint[] = [];
    if (dateRange?.from) {
        constraints.push(where('fecha_corte', '>=', Timestamp.fromDate(startOfDay(dateRange.from))));
    }
    if (dateRange?.to) {
        constraints.push(where('fecha_corte', '<=', Timestamp.fromDate(endOfDay(dateRange.to))));
    }
    if (deliveredByFilter !== 'todos') {
        constraints.push(where('persona_entrega_id', '==', deliveredByFilter));
    }
    if (receivedByFilter !== 'todos') {
        constraints.push(where('persona_recibe', '==', receivedByFilter));
    }
    return constraints;
  }, [dateRange, deliveredByFilter, receivedByFilter]);
  
  const { data: closings, loading: closingsLoading } = useFirestoreQuery<CashClosing>('cortes_caja', queryKey, ...queryConstraints);

  const isLoading = usersLoading || closingsLoading;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Reporte de Cierres de Caja</h2>

        <Card>
            <CardHeader>
                <CardTitle>Filtros de Búsqueda</CardTitle>
                <CardDescription>Busca cierres de caja por fecha o por personas involucradas.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                    <>{format(dateRange.from, "LLL dd, y", {locale: es})} - {format(dateRange.to, "LLL dd, y", {locale: es})}</>
                                ) : (
                                    format(dateRange.from, "LLL dd, y", {locale: es})
                                )
                            ) : (
                                <span>Periodo de tiempo</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                    </PopoverContent>
                </Popover>
                 <Select value={deliveredByFilter} onValueChange={setDeliveredByFilter} disabled={usersLoading}>
                    <SelectTrigger><SelectValue placeholder="Entregado por..." /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
                 <Select value={receivedByFilter} onValueChange={setReceivedByFilter} disabled={usersLoading}>
                    <SelectTrigger><SelectValue placeholder="Recibido por..." /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button onClick={() => setQueryKey(k => k + 1)} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Buscar
                </Button>
            </CardContent>
        </Card>

        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Historial de Cierres</CardTitle>
                <Button variant="outline"><Download className="mr-2 h-4 w-4"/> Descargar</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Entrega</TableHead>
                            <TableHead>Recibe</TableHead>
                            <TableHead className="text-right">Total Sistema</TableHead>
                            <TableHead className="text-right">Total Contado</TableHead>
                            <TableHead className="text-right">Diferencia</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({length: 5}).map((_, i) => (
                                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                            ))
                        ) : closings.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center h-24">No se encontraron cierres de caja.</TableCell></TableRow>
                        ) : (
                            closings.map(closing => (
                                <TableRow key={closing.id}>
                                    <TableCell>{format(closing.fecha_corte.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                                    <TableCell>{closing.persona_entrega_nombre}</TableCell>
                                    <TableCell>{closing.persona_recibe}</TableCell>
                                    <TableCell className="text-right">${closing.total_sistema.toLocaleString('es-CL')}</TableCell>
                                    <TableCell className="text-right">${closing.total_calculado.toLocaleString('es-CL')}</TableCell>
                                    <TableCell className={cn("text-right font-bold", closing.diferencia !== 0 ? 'text-destructive' : 'text-green-600')}>
                                        ${closing.diferencia.toLocaleString('es-CL')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => setSelectedClosing(closing)}><Eye className="mr-2 h-4 w-4"/> Ver Detalle</Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>

      <ClosingDetailModal 
        isOpen={!!selectedClosing} 
        onOpenChange={() => setSelectedClosing(null)} 
        closing={selectedClosing} 
      />
    </>
  );
}

