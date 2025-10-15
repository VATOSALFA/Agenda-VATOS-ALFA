
'use client';

import { useForm } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2 } from "lucide-react";

const customerFields = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Teléfono' },
  { id: 'dob', label: 'Fecha de Nacimiento' },
  { id: 'address', label: 'Dirección' },
  { id: 'notes', label: 'Notas del Cliente' },
];

export default function SitioWebPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            onlineReservations: true,
            marketVisibility: false,
            showHoursBy: 'professional',
            exclusiveForCreatedClients: false,
            allowClientNotes: true,
            predefinedNotes: '',
            cancellableReservations: true,
            editableReservations: true,
            editPolicy: 'Los clientes pueden editar sus reservas hasta 2 horas antes.',
            maxEdits: 2,
            privacyPolicyEnabled: false,
            privacyPolicyUrl: '',
            minReservationTime: '2 horas antes',
            maxFutureTime: '30 días',
            professionalPreference: 'client_choice',
            reviewSystemEnabled: true,
            showReviews: 'all',
            customerFields: customerFields.reduce((acc, field) => {
                acc[field.id] = { use: true, required: ['email', 'phone'].includes(field.id) };
                return acc;
            }, {} as Record<string, { use: boolean; required: boolean }>)
        }
    });

    const onSubmit = (data: unknown) => {
        setIsSubmitting(true);
        console.log("Website settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en la configuración de tu sitio web han sido guardados."
            })
        }, 1500);
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Sitio Web</h2>
        <p className="text-muted-foreground">
          Configura todo lo relacionado a tu sitio web de reservas.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="onlineReservations" className="font-semibold">Reservas en línea</Label>
              <Switch id="onlineReservations" defaultChecked={form.getValues('onlineReservations')} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="marketVisibility" className="font-semibold">Aparecer en Agenda VATOS ALFA Market</Label>
              <Switch id="marketVisibility" defaultChecked={form.getValues('marketVisibility')} />
            </div>
          </CardContent>
        </Card>

        <Accordion type="multiple" defaultValue={["item-1"]} className="w-full space-y-4">
            <AccordionItem value="item-1" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6">Reservas en el sitio web</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                    <div className="space-y-2">
                        <Label>Muestra tus horas según</Label>
                        <Select defaultValue={form.getValues('showHoursBy')}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="professional">Profesional</SelectItem><SelectItem value="service">Servicio</SelectItem></SelectContent></Select>
                    </div>
                    <div className="flex items-center justify-between"><Label htmlFor="exclusiveForCreatedClients">Reservas exclusivas para clientes creados en Agenda VATOS ALFA</Label><Switch id="exclusiveForCreatedClients" /></div>
                    <div className="flex items-center justify-between"><Label htmlFor="allowClientNotes">Permitir notas del cliente</Label><Switch id="allowClientNotes" defaultChecked /></div>
                    <div className="space-y-2">
                        <Label>Notas predefinidas</Label>
                        <Textarea placeholder="Ej: Por favor, llega 5 minutos antes de tu cita." />
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6">Edición y cancelación de reservas en línea</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                     <div className="flex items-center justify-between"><Label htmlFor="cancellableReservations">Reservas cancelables</Label><Switch id="cancellableReservations" defaultChecked /></div>
                     <div className="flex items-center justify-between"><Label htmlFor="editableReservations">Reservas editables</Label><Switch id="editableReservations" defaultChecked /></div>
                     <div className="space-y-2">
                        <Label>Política de edición de reservas</Label>
                        <Textarea defaultValue={form.getValues('editPolicy')} />
                    </div>
                     <div className="space-y-2">
                        <Label>Ediciones máximas</Label>
                        <Input type="number" defaultValue={form.getValues('maxEdits')} />
                    </div>
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-3" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6">Reservas y privacidad</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                     <div className="flex items-center justify-between"><Label htmlFor="privacyPolicyEnabled">Políticas de Reserva y Privacidad</Label><Switch id="privacyPolicyEnabled" /></div>
                     <div className="space-y-2">
                        <Label>Escribe la URL aquí</Label>
                        <Input placeholder="https://miempresa.com/politicas" />
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>

        <Card>
            <CardHeader><CardTitle>Configuración de Tiempos y Preferencias</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Tiempo mínimo de reserva</Label>
                    <Input defaultValue={form.getValues('minReservationTime')} />
                </div>
                <div className="space-y-2">
                    <Label>Tiempo máximo futuro</Label>
                    <Input defaultValue={form.getValues('maxFutureTime')} />
                </div>
                <div className="space-y-2">
                    <Label>Preferencia de profesionales</Label>
                    <Select defaultValue={form.getValues('professionalPreference')}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="client_choice">El cliente elige</SelectItem><SelectItem value="random">Aleatorio</SelectItem></SelectContent></Select>
                </div>
            </CardContent>
        </Card>
        
        <Accordion type="multiple" className="w-full space-y-4">
            <AccordionItem value="item-4" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6">Sistema de reseñas</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                    <div className="flex items-center justify-between"><Label htmlFor="reviewSystemEnabled">Sistema de reseñas automáticas</Label><Switch id="reviewSystemEnabled" defaultChecked /></div>
                    <div className="space-y-2">
                        <Label>Mostrar el puntaje total y comentarios de las reseñas</Label>
                        <Select defaultValue={form.getValues('showReviews')}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Mostrar todo</SelectItem><SelectItem value="score_only">Solo puntaje</SelectItem><SelectItem value="none">No mostrar</SelectItem></SelectContent></Select>
                    </div>
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-5" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6">Configuración de campos adicionales</AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datos del cliente</TableHead>
                                <TableHead className="text-center">Usar al agendar online</TableHead>
                                <TableHead className="text-center">Obligatorio al agendar online</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customerFields.map(field => (
                                <TableRow key={field.id}>
                                    <TableCell className="font-medium">{field.label}</TableCell>
                                    <TableCell className="text-center"><Switch defaultChecked={form.getValues(`customerFields.${field.id}.use`)} /></TableCell>
                                    <TableCell className="text-center"><Switch defaultChecked={form.getValues(`customerFields.${field.id}.required`)} /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
        
        <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Guardar Cambios
            </Button>
        </div>

      </form>
    </div>
  );
}
