
'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const barbers = [
  { id: 1, name: 'El Patrón', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'barber portrait' },
  { id: 2, name: 'El Sicario', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'man serious' },
  { id: 3, name: 'El Padrino', status: 'ocupado', avatar: 'https://placehold.co/100x100', dataAiHint: 'stylish man' },
];

const appointments = [
    { id: 1, barberId: 1, customer: 'Juan Perez', service: 'Corte Vatos', start: 9, duration: 1, color: 'bg-blue-100 border-blue-500 text-blue-800' },
    { id: 2, barberId: 1, customer: 'Carlos Gomez', service: 'Afeitado Alfa', start: 11, duration: 1.5, color: 'bg-green-100 border-green-500 text-green-800' },
    { id: 3, barberId: 2, customer: 'Luis Rodriguez', service: 'Corte y Barba', start: 10, duration: 2, color: 'bg-indigo-100 border-indigo-500 text-indigo-800' },
    { id: 4, barberId: 3, customer: 'Miguel Hernandez', service: 'Corte Vatos', start: 14, duration: 1, color: 'bg-blue-100 border-blue-500 text-blue-800' },
    { id: 5, barberId: 1, customer: 'Cliente Ocasional', service: 'Corte Vatos', start: 15, duration: 1, color: 'bg-purple-100 border-purple-500 text-purple-800' },
    { id: 6, barberId: 2, customer: 'Jorge Martinez', service: 'Diseño de Cejas', start: 13, duration: 0.5, color: 'bg-pink-100 border-pink-500 text-pink-800' },
    { id: 7, barberId: 3, customer: 'Horario Bloqueado', service: 'Almuerzo', start: 13, duration: 1, color: 'bg-gray-200 border-gray-400 text-gray-800' },
];

const TimeSlot = ({ hour }: { hour: number }) => (
  <div className="h-12 border-t border-border text-right pr-2">
    <span className="text-xs text-muted-foreground relative -top-2">{`${hour}:00`}</span>
  </div>
);

export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  const hours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full p-4 md:p-6 bg-slate-50">
      <aside className="w-full lg:w-80 space-y-6 flex-shrink-0">
        <Card className="shadow-md bg-white rounded-lg">
            <CardContent className="p-2">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md"
                    components={{
                      IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                      IconRight: () => <ChevronRight className="h-4 w-4" />,
                    }}
                />
            </CardContent>
        </Card>
        <Card className="shadow-md bg-white rounded-lg">
            <CardHeader>
                <CardTitle className="text-base font-semibold text-gray-800">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-600">Sucursal</label>
                    <Select defaultValue="principal">
                    <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Seleccionar sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="principal">Vatos Alfa Principal</SelectItem>
                        <SelectItem value="norte">Vatos Alfa Norte</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-600">Barbero</label>
                    <Select defaultValue="todos">
                    <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Seleccionar barbero" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {barbers.map((barber) => (
                            <SelectItem key={barber.id} value={String(barber.id)}>{barber.name}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <ScrollArea className="h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 min-w-max pb-4">
                {barbers.map((barber) => (
                    <div key={barber.id} className="w-72 flex-shrink-0">
                        <div className="flex items-center space-x-3 p-3 rounded-t-lg bg-white sticky top-0 z-10 border-b">
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={barber.avatar} alt={barber.name} data-ai-hint={barber.dataAiHint} />
                                <AvatarFallback>{barber.name.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold text-base text-gray-800">{barber.name}</p>
                                <Badge variant={barber.status === 'disponible' ? 'default' : 'destructive'} 
                                    className={cn(
                                        'text-xs py-0.5 px-2 font-medium',
                                        barber.status === 'disponible' && 'bg-green-100 text-green-800 border-green-200',
                                        barber.status !== 'disponible' && 'bg-red-100 text-red-800 border-red-200'
                                    )}
                                >{barber.status}</Badge>
                            </div>
                        </div>
                        <div className="relative bg-white/60 rounded-b-lg">
                            {hours.map((hour) => <TimeSlot key={hour} hour={hour} />)}
                            {appointments.filter(a => a.barberId === barber.id).map(appointment => (
                                <div key={appointment.id} 
                                    className={cn(
                                        "absolute w-[calc(100%-12px)] ml-[6px] py-1 px-2.5 rounded-md text-xs border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex flex-col justify-center", 
                                        appointment.color
                                    )} style={{
                                    top: `${(appointment.start - 9) * 3}rem`,
                                    height: `${appointment.duration * 3}rem`,
                                }}>
                                    <p className="font-bold text-sm truncate">{appointment.customer}</p>
                                    <p className="truncate">{appointment.service}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
      </main>
    </div>
  );
}
