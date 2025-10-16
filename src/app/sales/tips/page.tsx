

'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Download, Filter, DollarSign, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Local, Profesional } from "@/lib/types";

// Mock Data - In a real app this would come from a 'propinas' collection
const mockTipsData = [
    { id: '#3883', saleId: 'V001', date: '2025-07-15T19:03:00', localId: 'local1', clientId: 'client1', clientName: 'Sandra Sanchez', professionalId: 'prof1', professionalName: 'El Patrón', tip: 1000 },
    { id: '#3879', saleId: 'V002', date: '2025-07-15T17:14:00', localId: 'local1', clientId: 'client2', clientName: 'Luis Angel Martinez', professionalId: 'prof2', professionalName: 'El Sicario', tip: 1400 },
    { id: '#3876', saleId: 'V003', date: '2025-07-15T15:27:00', localId: 'local1', clientId: 'client3', clientName: 'Aldo Faraz', professionalId: 'prof2', professionalName: 'El Sicario', tip: 1400 },
    { id: '#3873', saleId: 'V004', date: '2025-07-15T13:43:00', localId: 'local1', clientId: 'client4', clientName: 'Pablo Fiores', professionalId: 'prof3', professionalName: 'El Padrino', tip: 1700 },
    { id: '#3872', saleId: 'V005', date: '2025-07-15T13:10:00', localId: 'local1', clientId: 'client5', clientName: 'David Flores', professionalId: 'prof3', professionalName: 'El Padrino', tip: 3290 },
    { id: '#3871', saleId: 'V006', date: '2025-07-15T11:53:00', localId: 'local1', clientId: 'client6', clientName: 'Dariel Siva', professionalId: 'prof1', professionalName: 'El Patrón', tip: 2100 },
    { id: '#3864', saleId: 'V007', date: '2025-07-14T17:25:00', localId: 'local1', clientId: 'client7', clientName: 'Antonio Castellano', professionalId: 'prof4', professionalName: 'Barbero Extra', tip: 2800 },
];


export default function TipsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [localFilter, setLocalFilter] = useState('todos');
  const [professionalFilter, setProfessionalFilter] = useState('todos');
  const [isLoading, setIsLoading] = useState(false);

  // In a real scenario, you'd fetch tips. For now, we simulate fetching and filtering.
  // const { data: tips, loading: tipsLoading } = useFirestoreQuery('propinas');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');

  const filteredTips = useMemo(() => {
    return mockTipsData.filter(tip => {
        const tipDate = new Date(tip.date);
        const dateMatch = !dateRange || (
            (!dateRange.from || tipDate >= startOfDay(dateRange.from)) &&
            (!dateRange.to || tipDate <= endOfDay(dateRange.to))
        );
        const localMatch = localFilter === 'todos' || tip.localId === localFilter;
        const professionalMatch = professionalFilter === 'todos' || tip.professionalId === professionalFilter;

        return dateMatch && localMatch && professionalMatch;
    });
  }, [dateRange, localFilter, professionalFilter]);

  const totalTips = useMemo(() => {
    return filteredTips.reduce((acc, item) => acc + item.tip, 0);
  }, [filteredTips]);

  const handleSearch = () => {
      setIsLoading(true);
      // Simulate API call delay
      setTimeout(() => {
          setIsLoading(false);
      }, 500);
  }

  useEffect(() => {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
      setDateRange({ from, to: today });
  }, []);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Propinas</h2>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filtros</CardTitle>
                <CardDescription>Filtra el registro de propinas por diferentes criterios.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Periodo</label>
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
                                        <span>Seleccionar rango</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-2">
                         <label className="text-sm font-medium">Local</label>
                        <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                {locales.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Profesional</label>
                         <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                 {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleSearch} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                    </Button>
                </div>
            </CardContent>
        </Card>

        <Card>
             <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Registro de Propinas</CardTitle>
                    <CardDescription>Detalle de las propinas recibidas en el período seleccionado.</CardDescription>
                </div>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Generar reporte</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Venta</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Local</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Profesional</TableHead>
                            <TableHead className="text-right">Propina</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                         {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                        ) : filteredTips.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center h-24">No hay datos para el período seleccionado.</TableCell></TableRow>
                        ) : filteredTips.map((tip) => (
                            <TableRow key={tip.id}>
                                <TableCell className="font-mono text-xs">{tip.id}</TableCell>
                                <TableCell className="font-mono text-xs">{tip.saleId}</TableCell>
                                <TableCell>{format(new Date(tip.date), 'dd-MM-yyyy hh:mm a')}</TableCell>
                                <TableCell>{tip.localId === 'local1' ? 'VATOS ALFA Barber Shop' : tip.localId}</TableCell>
                                <TableCell>{tip.clientName}</TableCell>
                                <TableCell>{tip.professionalName}</TableCell>
                                <TableCell className="text-right font-semibold">${tip.tip.toLocaleString('es-MX')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50">
                            <TableHead colSpan={6} className="text-right font-bold text-lg">Total Propinas</TableHead>
                            <TableHead className="text-right font-bold text-lg text-primary">${totalTips.toLocaleString('es-MX')}</TableHead>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}

    