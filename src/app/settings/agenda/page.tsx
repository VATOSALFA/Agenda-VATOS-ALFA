
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';

const customerFields = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Teléfono' },
  { id: 'dob', label: 'Fecha de Nacimiento' },
  { id: 'address', label: 'Dirección' },
  { id: 'notes', label: 'Notas del Cliente' },
];

interface AgendaSettings {
    blockDuration: string;
    overlappingReservations: boolean;
    simultaneousReservations: boolean;
    resourceOverload: boolean;
    internalOutOfHours: boolean;
    internalInBlocked: boolean;
    customerFields: Record<string, { use: boolean; required: boolean }>;
}

export default function AgendaSettingsPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const form = useForm<AgendaSettings>({
        defaultValues: {
            blockDuration: '30',
            overlappingReservations: true,
            simultaneousReservations: true,
            resourceOverload: false,
            internalOutOfHours: false,
            internalInBlocked: true,
            customerFields: customerFields.reduce((acc, field) => {
                acc[field.id] = { use: true, required: ['phone'].includes(field.id) };
                return acc;
            }, {} as Record<string, { use: boolean; required: boolean }>)
        }
    });
    
    useEffect(() => {
        const fetchSettings = async () => {
            const settingsRef = doc(db, 'configuracion', 'agenda');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                form.reset(docSnap.data() as AgendaSettings);
            }
            setIsLoading(false);
        };
        fetchSettings();
    }, [form]);

    const onSubmit = async (data: AgendaSettings) => {
        setIsSubmitting(true);
        try {
            const settingsRef = doc(db, 'configuracion', 'agenda');
            await setDoc(settingsRef, data, { merge: true });
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en la configuración de tu agenda han sido guardados."
            })
        } catch (error) {
            console.error("Error saving agenda settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
        }
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Comportamiento de reservas</h2>
        <p className="text-muted-foreground">
          Configura la visualización de tu agenda y el comportamiento de tus reservas creadas.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Bloque Agenda</CardTitle>
            <p className="text-muted-foreground text-sm">Esta sección determina el largo de cada bloque en la sección Agenda.</p>
          </CardHeader>
          <CardContent>
             <Controller
                name="blockDuration"
                control={form.control}
                render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Selecciona duración" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="15">15 minutos</SelectItem>
                            <SelectItem value="30">30 minutos</SelectItem>
                            <SelectItem value="60">60 minutos</SelectItem>
                        </SelectContent>
                    </Select>
                )}
             />
          </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>Configuración de Reservas</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <Controller name="overlappingReservations" control={form.control} render={({ field }) => (
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="overlapping-reservations">Reservas sobrepuestas</Label>
                            <p className="text-sm text-muted-foreground">Si habilitas esta opción, los profesionales pueden tener dos reservas en un mismo horario. Esto es válido para reservas ingresadas internamente.</p>
                        </div>
                        <Switch id="overlapping-reservations" checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                )} />
                 <Controller name="simultaneousReservations" control={form.control} render={({ field }) => (
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="simultaneous-reservations">Reservas simultáneas de clientes</Label>
                            <p className="text-sm text-muted-foreground">Si habilitas esta opción, los clientes pueden tener dos o más reservas en un mismo horario.</p>
                        </div>
                        <Switch id="simultaneous-reservations" checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                )} />
                 <Controller name="resourceOverload" control={form.control} render={({ field }) => (
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="resource-overload">Sobrecargo de recursos</Label>
                            <p className="text-sm text-muted-foreground">Al habilitar esta opción, podrás hacer reservas incluso cuando los recursos no estén siendo utilizados o no estén disponibles.</p>
                        </div>
                        <Switch id="resource-overload" checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                 )} />
            </CardContent>
        </Card>
        
        <Accordion type="multiple" className="w-full space-y-4">
            <AccordionItem value="item-1" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Reservas internas fuera de horario</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-6">
                    <Controller name="internalInBlocked" control={form.control} render={({ field }) => (
                        <div className="flex items-center justify-between">
                            <div>
                                <Label htmlFor="internal-in-blocked">Reservas en Bloques de horario</Label>
                                <p className="text-sm text-muted-foreground">Esta opción te permite crear reservas internas en bloques de horario en la agenda.</p>
                            </div>
                            <Switch id="internal-in-blocked" checked={field.value} onCheckedChange={field.onChange} />
                        </div>
                    )} />
                    <Controller name="internalOutOfHours" control={form.control} render={({ field }) => (
                        <div className="flex items-center justify-between">
                            <div>
                                <Label htmlFor="internal-out-of-hours">Horario extendido para reservas internas</Label>
                                <p className="text-sm text-muted-foreground">Habilita esta opción para extender el horario en la sección Agenda.</p>
                            </div>
                            <Switch id="internal-out-of-hours" checked={field.value} onCheckedChange={field.onChange} />
                        </div>
                    )} />
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-2" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Configuración de campos adicionales</AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                    {isLoading ? (
                        <div className="p-4"><Skeleton className="h-48 w-full" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Datos del cliente</TableHead>
                                    <TableHead className="text-center">Usar en agenda</TableHead>
                                    <TableHead className="text-center">Obligatorio en agenda</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customerFields.map(field => (
                                    <TableRow key={field.id}>
                                        <TableCell className="font-medium">{field.label}</TableCell>
                                        <TableCell className="text-center">
                                            <Controller
                                                name={`customerFields.${field.id}.use`}
                                                control={form.control}
                                                render={({ field: switchField }) => (
                                                    <Switch checked={switchField.value} onCheckedChange={switchField.onChange} />
                                                )}
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Controller
                                                name={`customerFields.${field.id}.required`}
                                                control={form.control}
                                                render={({ field: switchField }) => (
                                                    <Switch checked={switchField.value} onCheckedChange={switchField.onChange} disabled={!form.watch(`customerFields.${field.id}.use`)} />
                                                )}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
        
        <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
            <Button type="submit" disabled={isSubmitting || isLoading}>
                {(isSubmitting || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Guardar Cambios
            </Button>
        </div>

      </form>
    </div>
  );
}
