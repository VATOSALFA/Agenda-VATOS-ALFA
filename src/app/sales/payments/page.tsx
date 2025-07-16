
'use client';

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, Download, Minus, Equal } from "lucide-react";
import { cn } from "@/lib/utils";

const mockTransactions = [
    { id: '3912374', comprobante: '1a1f9-018028', fecha: '2025-07-15', local: 'VATOS ALFA Barber Shop', cliente: 'edgar barrera', origen: 'Terminal', monto: 154, propina: 14, comision: 15, total_transferencia: 139, fecha_transferencia: '2025-07-16' },
    { id: '3912164', comprobante: 'fb06e-579767', fecha: '2025-07-15', local: 'VATOS ALFA Barber Shop', cliente: 'mark Campos', origen: 'Terminal', monto: 140, propina: 0, comision: 14, total_transferencia: 126, fecha_transferencia: '2025-07-16' },
    { id: '3912054', comprobante: '79acc-318553', fecha: '2025-07-15', local: 'VATOS ALFA Barber Shop', cliente: 'Gerardo Lopez Rueda', origen: 'Terminal', monto: 140, propina: 0, comision: 14, total_transferencia: 126, fecha_transferencia: '2025-07-16' },
    { id: '3912049', comprobante: 'dbb02-045798', fecha: '2025-07-15', local: 'VATOS ALFA Barber Shop', cliente: 'adrian arzava', origen: 'Terminal', monto: 310, propina: 30, comision: 31, total_transferencia: 279, fecha_transferencia: '2025-07-16' },
    { id: '3911923', comprobante: 'ab627-497224', fecha: '2025-07-15', local: 'VATOS ALFA Barber Shop', cliente: 'sandra sanchez', origen: 'Terminal', monto: 198, propina: 18, comision: 20, total_transferencia: 178, fecha_transferencia: '2025-07-16' },
];

const totalMonto = mockTransactions.reduce((acc, t) => acc + t.monto, 0);
const totalComision = mockTransactions.reduce((acc, t) => acc + t.comision, 0);
const totalNeto = totalMonto - totalComision;


const SummaryCard = ({ title, amount }: { title: string, amount: number }) => (
    <Card className="flex-1">
        <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">${amount.toLocaleString('es-CL')}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
        </CardContent>
    </Card>
)

const IconSeparator = ({ icon: Icon }: { icon: React.ElementType }) => (
    <div className="flex items-center justify-center">
        <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
)

export default function PaymentsPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Pagos y Transferencias</h2>
        <Tabs defaultValue="transactions">
            <TabsList>
                <TabsTrigger value="transactions">Transacciones</TabsTrigger>
                <TabsTrigger value="transfers">Transferencias Realizadas</TabsTrigger>
                <TabsTrigger value="charges">Tus Cobros</TabsTrigger>
            </TabsList>
            <TabsContent value="transactions" className="space-y-4">
                <Card>
                    <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                        <span>Desde/Hasta</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                            </PopoverContent>
                        </Popover>
                         <Select><SelectTrigger><SelectValue placeholder="Locales" /></SelectTrigger><SelectContent /></Select>
                         <Select><SelectTrigger><SelectValue placeholder="Origen" /></SelectTrigger><SelectContent /></Select>
                    </CardContent>
                </Card>

                <div className="flex items-center gap-4">
                    <SummaryCard title="MONTO TOTAL" amount={totalMonto} />
                    <IconSeparator icon={Minus} />
                    <SummaryCard title="COMISIÓN" amount={totalComision} />
                    <IconSeparator icon={Equal} />
                    <SummaryCard title="TOTAL NETO" amount={totalNeto} />
                </div>

                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                         <CardTitle>Transacciones</CardTitle>
                         <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar reporte</Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Comprobante</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Local</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Origen</TableHead>
                                    <TableHead className="text-right">Monto</TableHead>
                                    <TableHead className="text-right">Propina</TableHead>
                                    <TableHead className="text-right">Comisión</TableHead>
                                    <TableHead className="text-right">Total Transferencia</TableHead>
                                    <TableHead>Fecha Transferencia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mockTransactions.map((tx) => (
                                    <TableRow key={tx.id}>
                                        <TableCell className="font-mono text-xs">{tx.id}</TableCell>
                                        <TableCell className="font-mono text-xs">{tx.comprobante}</TableCell>
                                        <TableCell>{format(new Date(tx.fecha), 'dd-MM-yyyy')}</TableCell>
                                        <TableCell>{tx.local}</TableCell>
                                        <TableCell>{tx.cliente}</TableCell>
                                        <TableCell>{tx.origen}</TableCell>
                                        <TableCell className="text-right">${tx.monto.toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="text-right">${tx.propina.toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="text-right text-destructive">-${tx.comision.toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="text-right font-bold text-primary">${tx.total_transferencia.toLocaleString('es-CL')}</TableCell>
                                        <TableCell>{format(new Date(tx.fecha_transferencia), 'dd-MM-yyyy')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="transfers">
                <Card>
                    <CardHeader><CardTitle>Transferencias Realizadas</CardTitle></CardHeader>
                    <CardContent><p className="text-muted-foreground">Contenido de transferencias realizadas...</p></CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="charges">
                <Card>
                    <CardHeader><CardTitle>Tus Cobros</CardTitle></CardHeader>
                    <CardContent><p className="text-muted-foreground">Contenido de tus cobros...</p></CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </div>
  );
}

  