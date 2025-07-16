
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart as RechartsLineChart, XAxis, YAxis, Tooltip, Legend, Line, CartesianGrid } from 'recharts';
import { Calendar as CalendarIcon, Search, CheckCircle, XCircle, Clock, AlertTriangle, Users, BookOpen, Truck, Store, Scissors, DollarSign, BarChart, LineChartIcon, PieChartIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

const reservationStatuses = [
    { id: 'reservado', label: 'Reservado', icon: <BookOpen className="h-4 w-4 mr-2" /> },
    { id: 'confirmado', label: 'Confirmado', icon: <CheckCircle className="h-4 w-4 mr-2" /> },
    { id: 'asiste', label: 'Asiste', icon: <Users className="h-4 w-4 mr-2" /> },
    { id: 'no-asiste', label: 'No asiste', icon: <XCircle className="h-4 w-4 mr-2" /> },
    { id: 'cancelado', label: 'Cancelado', icon: <AlertTriangle className="h-4 w-4 mr-2" /> },
    { id: 'en-espera', label: 'En espera', icon: <Clock className="h-4 w-4 mr-2" /> },
    { id: 'pendiente', label: 'Pendiente', icon: <Clock className="h-4 w-4 mr-2" /> },
];

const serviceRankingData = [
  { name: 'Corte Vatos', value: 400 },
  { name: 'Afeitado Alfa', value: 300 },
  { name: 'Corte y Barba', value: 300 },
  { name: 'Diseño de Cejas', value: 200 },
];

const reservationsByDayData = [
  { name: 'Lunes', value: 18 },
  { name: 'Martes', value: 25 },
  { name: 'Miércoles', value: 30 },
  { name: 'Jueves', value: 45 },
  { name: 'Viernes', value: 60 },
  { name: 'Sábado', value: 80 },
  { name: 'Domingo', value: 10 },
];

const reservationsByHourData = [
  { hour: '09:00', Lunes: 1, Martes: 2, Miércoles: 1, Jueves: 3, Viernes: 5, Sábado: 8, Domingo: 0 },
  { hour: '10:00', Lunes: 2, Martes: 3, Miércoles: 4, Jueves: 5, Viernes: 8, Sábado: 12, Domingo: 1 },
  { hour: '11:00', Lunes: 3, Martes: 4, Miércoles: 5, Jueves: 7, Viernes: 10, Sábado: 15, Domingo: 2 },
  { hour: '12:00', Lunes: 2, Martes: 3, Miércoles: 4, Jueves: 6, Viernes: 9, Sábado: 10, Domingo: 2 },
  { hour: '13:00', Lunes: 1, Martes: 1, Miércoles: 1, Jueves: 2, Viernes: 3, Sábado: 5, Domingo: 1 },
  { hour: '14:00', Lunes: 0, Martes: 0, Miércoles: 0, Jueves: 0, Viernes: 0, Sábado: 0, Domingo: 0 },
  { hour: '15:00', Lunes: 2, Martes: 3, Miércoles: 4, Jueves: 5, Viernes: 6, Sábado: 8, Domingo: 1 },
  { hour: '16:00', Lunes: 3, Martes: 4, Miércoles: 5, Jueves: 7, Viernes: 8, Sábado: 10, Domingo: 2 },
  { hour: '17:00', Lunes: 2, Martes: 3, Miércoles: 4, Jueves: 6, Viernes: 7, Sábado: 9, Domingo: 1 },
  { hour: '18:00', Lunes: 2, Martes: 2, Miércoles: 2, Jueves: 4, Viernes: 4, Sábado: 3, Domingo: 0 },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/80 backdrop-blur-sm p-2 border border-border rounded-lg shadow-lg">
          <p className="font-bold">{`${label}`}</p>
          {payload.map((pld: any, index: number) => (
             <div key={index} style={{ color: pld.color }}>
                {`${pld.name}: ${pld.value}`}
             </div>
          ))}
        </div>
      );
    }
    return null;
  };

export default function ReservationsReportPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(2025, 6, 1),
        to: new Date(2025, 6, 31),
    });

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de Reservas</h2>
            
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
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
                        <Select defaultValue="todos">
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos los estados</SelectItem>
                                {reservationStatuses.map(status => (
                                    <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button><Search className="mr-2 h-4 w-4" /> Buscar</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        {reservationStatuses.map(status => (
                            <div key={status.id} className="flex items-center space-x-2">
                                <Checkbox id={status.id} />
                                <label htmlFor={status.id} className="font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {status.label}
                                </label>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <aside className="lg:col-span-1">
                    <Card>
                        <CardHeader><CardTitle>Filtros Avanzados</CardTitle></CardHeader>
                        <CardContent>
                            <Accordion type="multiple" defaultValue={['general', 'locales']} className="w-full">
                                <AccordionItem value="general">
                                    <AccordionTrigger>General</AccordionTrigger>
                                    <AccordionContent className="space-y-2">
                                        <p className="text-muted-foreground text-xs">Filtros generales aquí.</p>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="locales">
                                    <AccordionTrigger>Locales</AccordionTrigger>
                                    <AccordionContent className="space-y-2">
                                        <div className="flex items-center"><Checkbox id="local1" /><label htmlFor="local1" className="ml-2">VATOS ALFA Principal</label></div>
                                        <div className="flex items-center"><Checkbox id="local2" /><label htmlFor="local2" className="ml-2">VATOS ALFA Norte</label></div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="servicios">
                                    <AccordionTrigger>Servicios</AccordionTrigger>
                                     <AccordionContent className="space-y-2">
                                        <p className="text-muted-foreground text-xs">Filtros de servicios aquí.</p>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="mensajeria">
                                    <AccordionTrigger>Mensajería Móvil</AccordionTrigger>
                                     <AccordionContent className="space-y-2">
                                        <p className="text-muted-foreground text-xs">Filtros de mensajería.</p>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>
                </aside>

                <main className="lg:col-span-3 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">CANTIDAD DE RESERVAS</CardTitle>
                                <BookOpen className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">228</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">RECAUDACIÓN</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">$3,125,500</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center"><PieChartIcon className="mr-2 h-5 w-5"/> Ranking Servicios Utilizados</CardTitle></CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <RechartsPieChart>
                                        <Pie data={serviceRankingData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                            {serviceRankingData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconSize={10}/>
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="flex items-center"><PieChartIcon className="mr-2 h-5 w-5"/> Reservas por Día de la Semana</CardTitle></CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <RechartsPieChart>
                                        <Pie data={reservationsByDayData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                            {reservationsByDayData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconSize={10}/>
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader><CardTitle className="flex items-center"><LineChartIcon className="mr-2 h-5 w-5"/> Reservas por Hora por Día</CardTitle></CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <RechartsLineChart data={reservationsByHourData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="hour" />
                                    <YAxis />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Line type="monotone" dataKey="Lunes" stroke={COLORS[0]} />
                                    <Line type="monotone" dataKey="Martes" stroke={COLORS[1]} />
                                    <Line type="monotone" dataKey="Miércoles" stroke={COLORS[2]} />
                                    <Line type="monotone" dataKey="Jueves" stroke={COLORS[3]} />
                                    <Line type="monotone" dataKey="Viernes" stroke={COLORS[4]} />
                                    <Line type="monotone" dataKey="Sábado" stroke={COLORS[0]} strokeDasharray="5 5"/>
                                    <Line type="monotone" dataKey="Domingo" stroke={COLORS[1]} strokeDasharray="5 5"/>
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </main>
            </div>
        </div>
    )
}
