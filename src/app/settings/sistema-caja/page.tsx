
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";

const paymentMethods = [
  { id: 'efectivo', name: 'Efectivo', active: true, requireCode: false },
  { id: 'tarjeta', name: 'Tarjeta', active: true, requireCode: false },
  { id: 'transferencia', name: 'Transferencia', active: true, requireCode: false },
];

const ToggleField = ({ name, label, control }: { name: string, label: string, control: any }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
        <Label htmlFor={name} className="flex-1 pr-4">{label}</Label>
        <Controller
            name={name}
            control={control}
            render={({ field }) => (
                <Switch
                    id={name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                />
            )}
        />
    </div>
);


export default function SistemaCajaPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            enableCashBox: true,
            trackCash: true,
            requireClient: true,
            allowPriceEditing: false,
            requireServiceInfo: false,
            requireCashierCode: false,
            showDecimals: true,
            commissionAssisted: true,
            commissionNoReservation: true,
            commissionFullPayment: true,
            businessName: '',
            rfc: '',
            fiscalRegime: '',
            fiscalAddress: '',
            additionalInfo: '',
            showClientInfo: true,
            showProfessionalName: true,
            useBranchBilling: false,
            differentiateVat: false,
            receiptSize: '80mm',
            paymentMethods: paymentMethods.reduce((acc, method) => {
                acc[method.id] = { active: method.active, requireCode: method.requireCode };
                return acc;
            }, {} as any)
        }
    });

    const onSubmit = (data: any) => {
        setIsSubmitting(true);
        console.log("Sistema de Caja settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en el sistema de caja han sido guardados."
            })
        }, 1500);
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Sistema de Caja</h2>
        <p className="text-muted-foreground">
          Configura todo lo relacionado a tu sistema de caja.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Configuraciones Generales</CardTitle>
          </CardHeader>
          <CardContent>
            <ToggleField name="enableCashBox" label="Habilitar caja de ventas" control={form.control} />
            <ToggleField name="trackCash" label="Hacer seguimiento del efectivo en caja" control={form.control} />
            <ToggleField name="requireClient" label="Requerir cliente en pago" control={form.control} />
            <ToggleField name="allowPriceEditing" label="Permitir edición de precios en pago y reservas" control={form.control} />
            <ToggleField name="requireServiceInfo" label="Requerir información de servicios en pagos" control={form.control} />
            <ToggleField name="requireCashierCode" label="Requerir código de cajero para acciones de cajas" control={form.control} />
            <ToggleField name="showDecimals" label="Visualizar montos totales con decimales" control={form.control} />
          </CardContent>
        </Card>

        <Accordion type="multiple" className="w-full space-y-4">
            <AccordionItem value="item-1" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Configuración de comisiones</AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                    <ToggleField name="commissionAssisted" label="Reservas asistidas" control={form.control} />
                    <ToggleField name="commissionNoReservation" label="Servicios sin reserva" control={form.control} />
                    <ToggleField name="commissionFullPayment" label="Pagos completos" control={form.control} />
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-2" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Configuración de comprobante de pago</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="businessName">Razón social</Label><Input id="businessName" {...form.register('businessName')} /></div>
                        <div className="space-y-2"><Label htmlFor="rfc">RFC</Label><Input id="rfc" {...form.register('rfc')} /></div>
                        <div className="space-y-2"><Label htmlFor="fiscalRegime">Régimen fiscal</Label><Input id="fiscalRegime" {...form.register('fiscalRegime')} /></div>
                        <div className="space-y-2"><Label htmlFor="fiscalAddress">Dirección fiscal</Label><Input id="fiscalAddress" {...form.register('fiscalAddress')} /></div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="additionalInfo">Información adicional</Label>
                        <Textarea id="additionalInfo" {...form.register('additionalInfo')} />
                    </div>
                    <div className="space-y-4 pt-4 border-t">
                        <ToggleField name="showClientInfo" label="Mostrar información del cliente" control={form.control} />
                        <ToggleField name="showProfessionalName" label="Mostrar nombre de los profesionales" control={form.control} />
                        <ToggleField name="useBranchBilling" label="Usar información de facturación distinta por sucursal" control={form.control} />
                        <ToggleField name="differentiateVat" label="Diferenciar IVA de productos en comprobantes de caja" control={form.control} />
                    </div>
                     <div className="space-y-2 pt-4 border-t">
                        <Label>Tamaño del comprobante</Label>
                        <Controller
                            name="receiptSize"
                            control={form.control}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="80mm">80mm</SelectItem><SelectItem value="58mm">58mm</SelectItem></SelectContent>
                                </Select>
                            )}
                        />
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Métodos de pago</AccordionTrigger>
                <AccordionContent className="p-6 pt-0">
                    <div className="flex justify-end mb-4">
                        <Button type="button" variant="outline"><PlusCircle className="mr-2 h-4 w-4"/> Agregar método</Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Medios de Pago</TableHead>
                                <TableHead className="text-center">Activo</TableHead>
                                <TableHead className="text-center">Requerir Código</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {paymentMethods.map(method => (
                                <TableRow key={method.id}>
                                    <TableCell className="font-medium">{method.name}</TableCell>
                                    <TableCell className="text-center">
                                        <Controller
                                            name={`paymentMethods.${method.id}.active`}
                                            control={form.control}
                                            render={({ field }) => (
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                         <Controller
                                            name={`paymentMethods.${method.id}.requireCode`}
                                            control={form.control}
                                            render={({ field }) => (
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            )}
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
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                Guardar Cambios
            </Button>
        </div>
      </form>
    </div>
  );
}
