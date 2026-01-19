
'use client';

import { useForm, Controller } from 'react-hook-form';
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
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

const customerFields = [
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Teléfono' },
    { id: 'dob', label: 'Fecha de Nacimiento' },
    { id: 'address', label: 'Dirección' },
    { id: 'notes', label: 'Notas del Cliente' },
];

export default function SitioWebPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            slogan: '',
            onlineReservations: true,
            marketVisibility: false,
            showHoursBy: 'professional',
            exclusiveForCreatedClients: false,
            allowClientNotes: true,
            heroDescription: '', // Added hero description
            slotInterval: 30, // New default for slot interval
            predefinedNotes: '',
            cancellableReservations: true,
            editableReservations: true,
            editPolicy: 'Los clientes pueden editar sus reservas hasta 2 horas antes.',
            maxEdits: 2,
            privacyPolicyEnabled: false,
            privacyUrl: '',
            termsUrl: '',
            minReservationTime: 2,
            maxFutureTime: 30,
            professionalPreference: 'client_choice',
            reviewSystemEnabled: true,
            showReviews: 'all',
            customerFields: customerFields.reduce((acc, field) => {
                acc[field.id] = { use: true, required: ['email', 'phone'].includes(field.id) };
                return acc;
            }, {} as Record<string, { use: boolean; required: boolean }>)
        }
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (!db) return;
            try {
                const docSnap = await getDoc(doc(db, 'settings', 'website'));
                if (docSnap.exists()) {
                    const data = docSnap.data();

                    // Normalize customerFields (handle Legacy Flat vs New Nested)
                    let normalizedFields = { ...form.getValues().customerFields };

                    if (data.customerFields) {
                        normalizedFields = { ...normalizedFields, ...data.customerFields };
                    } else {
                        // Check for flat fields in root (Legacy migration)
                        customerFields.forEach(field => {
                            if (data[field.id]) {
                                normalizedFields[field.id] = data[field.id];
                            }
                        });
                    }

                    form.reset({
                        ...form.getValues(),
                        ...data,
                        heroDescription: data.heroDescription || '', // Load hero description
                        slotInterval: data.slotInterval || 30, // Load slot interval
                        customerFields: normalizedFields
                    });
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            }
        };
        loadSettings();
    }, [db]);

    const onSubmit = async (data: any) => {
        if (!db) return;
        setIsSubmitting(true);
        try {
            // Prepare data, ensuring numbers are numbers and cleaning up structure
            const saveData: any = {
                ...data,
                minReservationTime: Number(data.minReservationTime),
                maxFutureTime: Number(data.maxFutureTime),
                customerFields: data.customerFields
            };

            // Remove legacy flat fields if they exist in the form data
            customerFields.forEach(field => {
                delete saveData[field.id];
            });

            await setDoc(doc(db, 'settings', 'website'), saveData);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en la configuración de tu sitio web han sido guardados."
            });
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Hubo un problema al guardar la configuración."
            });
        } finally {
            setIsSubmitting(false);
        }
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
                            <Controller
                                control={form.control}
                                name="onlineReservations"
                                render={({ field }) => (
                                    <Switch
                                        id="onlineReservations"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </div>

                    </CardContent>
                </Card>

                <Accordion type="multiple" defaultValue={[]} className="w-full space-y-4">
                    <AccordionItem value="item-1" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6">Título y Subtítulo</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label>Título Principal (Slogan)</Label>
                                    <span className="text-xs text-muted-foreground">
                                        {(form.watch('slogan') || '').length}/50
                                    </span>
                                </div>
                                <Input
                                    placeholder="Tu slogan principal"
                                    maxLength={50}
                                    {...form.register('slogan')}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label>Subtítulo (Descripción)</Label>
                                    <span className="text-xs text-muted-foreground">
                                        {(form.watch('heroDescription') || '').length}/50
                                    </span>
                                </div>
                                <Textarea
                                    placeholder="Agenda tu cita en segundos. Selecciona sucursal, servicios y profesional."
                                    maxLength={50}
                                    {...form.register('heroDescription')}
                                />
                                <p className="text-[0.8rem] text-muted-foreground">
                                    Texto que aparece debajo del título principal. Máximo 50 caracteres.
                                </p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>



                    <AccordionItem value="item-3" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6">Términos y condiciones</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="privacyPolicyEnabled">Políticas de Reserva y Privacidad</Label>
                                <Controller
                                    control={form.control}
                                    name="privacyPolicyEnabled"
                                    render={({ field }) => (
                                        <Switch
                                            id="privacyPolicyEnabled"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    )}
                                />
                            </div>

                            {form.watch('privacyPolicyEnabled') && (
                                <>
                                    <div className="space-y-2">
                                        <Label>URL de Aviso de Privacidad</Label>
                                        <Input
                                            placeholder="https://vatosalfa.com/privacidad"
                                            {...form.register('privacyUrl')}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>URL de Términos y Condiciones</Label>
                                        <Input
                                            placeholder="https://vatosalfa.com/terminos"
                                            {...form.register('termsUrl')}
                                        />
                                    </div>
                                </>
                            )}
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-4" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6">Configuración de Tiempos y Preferencias</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-6">
                            <div className="space-y-2">
                                <Label>Tiempo mínimo de reserva</Label>
                                <p className="text-sm text-muted-foreground">
                                    Horas mínimas requeridas para que un cliente reserve. No se podrá reservar con menos anticipación.
                                </p>
                                <div className="flex w-full items-center gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        {...form.register('minReservationTime')}
                                        className="flex-1"
                                    />
                                    <div className="flex items-center justify-center border rounded-md px-4 h-10 bg-muted text-muted-foreground min-w-[80px]">
                                        Horas
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Tiempo máximo futuro</Label>
                                <p className="text-sm text-muted-foreground">
                                    Tiempo máximo que una persona puede reservar a futuro. No se permiten citas para más de 365 días a futuro.
                                </p>
                                <div className="flex w-full items-center gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={365}
                                        {...form.register('maxFutureTime')}
                                        className="flex-1"
                                    />
                                    <div className="flex items-center justify-center border rounded-md px-4 h-10 bg-muted text-muted-foreground min-w-[80px]">
                                        Días
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Intervalo de horarios de cita</Label>
                                <p className="text-sm text-muted-foreground">
                                    Elige la separación entre los horarios disponibles.
                                </p>
                                <Controller
                                    control={form.control}
                                    name="slotInterval"
                                    render={({ field }) => (
                                        <Select
                                            value={String(field.value)}
                                            onValueChange={(val) => field.onChange(Number(val))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecciona un intervalo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="15">15 minutos</SelectItem>
                                                <SelectItem value="30">30 minutos</SelectItem>
                                                <SelectItem value="45">45 minutos</SelectItem>
                                                <SelectItem value="60">1 hora</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>


                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-5" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6">Datos requeridos para agendar</AccordionTrigger>
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
                                            <TableCell className="text-center">
                                                <Switch
                                                    checked={form.watch(`customerFields.${field.id}.use`)}
                                                    onCheckedChange={(checked) => form.setValue(`customerFields.${field.id}.use`, checked)}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Switch
                                                    checked={form.watch(`customerFields.${field.id}.required`)}
                                                    onCheckedChange={(checked) => form.setValue(`customerFields.${field.id}.required`, checked)}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </div>

            </form>
        </div>
    );
}
