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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const barbers = [
  { id: 1, name: 'El Patrón', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'barber portrait' },
  { id: 2, name: 'El Sicario', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'man serious' },
  { id: 3, name: 'El Padrino', status: 'ocupado', avatar: 'https://placehold.co/100x100', dataAiHint: 'stylish man' },
];

const appointments = [
    { id: 1, barberId: 1, customer: 'Juan Perez', service: 'Corte Vatos', start: 9, duration: 1, color: 'bg-primary/80 border-primary' },
    { id: 2, barberId: 1, customer: 'Carlos Gomez', service: 'Afeitado Alfa', start: 11, duration: 1.5, color: 'bg-secondary/80 border-secondary' },
    { id: 3, barberId: 2, customer: 'Luis Rodriguez', service: 'Corte y Barba', start: 10, duration: 2, color: 'bg-green-500/80 border-green-500' },
    { id: 4, barberId: 3, customer: 'Miguel Hernandez', service: 'Corte Vatos', start: 14, duration: 1, color: 'bg-primary/80 border-primary' },
    { id: 5, barberId: 1, customer: 'Cliente Ocasional', service: 'Corte Vatos', start: 15, duration: 1, color: 'bg-purple-500/80 border-purple-500' },
    { id: 6, barberId: 2, customer: 'Jorge Martinez', service: 'Diseño de Cejas', start: 13, duration: 0.5, color: 'bg-pink-500/80 border-pink-500' },
    { id: 7, barberId: 3, customer: 'Horario Bloqueado', service: 'Almuerzo', start: 13, duration: 1, color: 'bg-destructive/80 border-destructive' },
];

const TimeSlot = ({ hour }: { hour: number }) => (
  <div className="h-16 border-t border-border text-right pr-2 pt-1">
    <span className="text-xs text-muted-foreground relative -top-3">{`${hour}:00`}</span>
  </div>
);

export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  const hours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM

  return (
    <div className="flex gap-8 h-[calc(100vh-120px)]">
      <aside className="w-1/4 xl:w-1/5 space-y-6">
        <Card>
            <CardContent className="p-2">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md"
                />
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Sucursal</label>
                    <Select defaultValue="principal">
                    <SelectTrigger>
                        <SelectValue placeholder="Seleccionar sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="principal">Vatos Alfa Principal</SelectItem>
                        <SelectItem value="norte">Vatos Alfa Norte</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Barbero</label>
                    <Select defaultValue="todos">
                    <SelectTrigger>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-[900px]">
            {barbers.map((barber) => (
                <div key={barber.id}>
                    <div className="flex items-center space-x-3 p-2 rounded-t-lg bg-card sticky top-0 z-10 border-b">
                        <Avatar>
                            <AvatarImage src={barber.avatar} alt={barber.name} data-ai-hint={barber.dataAiHint} />
                            <AvatarFallback>{barber.name.substring(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold">{barber.name}</p>
                            <Badge variant={barber.status === 'disponible' ? 'default' : 'destructive'} 
                                className={cn(
                                    barber.status === 'disponible' && 'bg-green-100 text-green-800 border-green-200',
                                    barber.status !== 'disponible' && 'bg-red-100 text-red-800 border-red-200'
                                )}
                            >{barber.status}</Badge>
                        </div>
                    </div>
                    <div className="relative bg-card/50 rounded-b-lg">
                        {hours.map((hour) => <TimeSlot key={hour} hour={hour} />)}
                        {appointments.filter(a => a.barberId === barber.id).map(appointment => (
                            <div key={appointment.id} className={cn("absolute w-[calc(100%-8px)] left-1 p-2 rounded-lg text-white text-xs border", appointment.color)} style={{
                                top: `${(appointment.start - 9) * 4}rem`,
                                height: `${appointment.duration * 4}rem`,
                            }}>
                                <p className="font-bold">{appointment.customer}</p>
                                <p>{appointment.service}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </main>
    </div>
  );
}
