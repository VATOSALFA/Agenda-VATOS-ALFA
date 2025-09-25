
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, Copy, Info } from "lucide-react";

export default function PagosAgendaProPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            showTips: true,
            onlinePayments: true,
            collectionLink: true,
            editReservationStatus: false,
            bank: '',
            accountHolder: '',
            clabe: '',
            mercadoPagoPublicKey: '',
            mercadoPagoAccessToken: '',
        }
    });
    
    const collectionUrl = 'https://vatosalfa--agenda-1ae08.us-central1.hosted.app/link-cobro';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(collectionUrl);
        toast({
          title: '¡Copiado!',
          description: 'El link de cobro ha sido copiado al portapapeles.',
        });
    }

    const onSubmit = (data: any) => {
        setIsSubmitting(true);
        console.log("Pagos settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en la configuración de pagos han sido guardados."
            })
        }, 1500);
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Agenda VATOS ALFA</h2>
        <p className="text-muted-foreground">
          Cobra en la terminal con Agenda VATOS ALFA.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
        <Card>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <Label htmlFor="show-tips" className="font-semibold text-base">Mostrar opciones de propina</Label>
                    <Controller
                        name="showTips"
                        control={form.control}
                        render={({ field }) => (
                            <Switch id="show-tips" checked={field.value} onCheckedChange={field.onChange} />
                        )}
                    />
                </div>
            </CardContent>
        </Card>
        
        <Accordion type="multiple" defaultValue={['item-1', 'item-2']} className="w-full space-y-4">
            <AccordionItem value="item-1" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Pagos en línea</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-6">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="online-payments">Pagos en línea</Label>
                        <Controller name="onlinePayments" control={form.control} render={({ field }) => (
                            <Switch id="online-payments" checked={field.value} onCheckedChange={field.onChange} />
                        )}/>
                    </div>
                     <div className="flex items-center justify-between">
                        <div className="flex-grow pr-4">
                            <Label htmlFor="collection-link">Link de cobro</Label>
                             <div className="flex items-center space-x-2 mt-2">
                                <Input readOnly value={collectionUrl} className="flex-1 text-xs h-9" />
                                <Button size="sm" type="button" onClick={copyToClipboard}><Copy className="mr-2 h-4 w-4" /> Copia tu link</Button>
                            </div>
                        </div>
                        <Controller name="collectionLink" control={form.control} render={({ field }) => (
                            <Switch id="collection-link" checked={field.value} onCheckedChange={field.onChange} />
                        )}/>
                    </div>
                     <div className="flex items-center justify-between">
                        <Label htmlFor="edit-reservation-status">Editar estado de las reservas</Label>
                        <Controller name="editReservationStatus" control={form.control} render={({ field }) => (
                             <Switch id="edit-reservation-status" checked={field.value} onCheckedChange={field.onChange} />
                        )}/>
                    </div>
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="item-2" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Datos bancarios</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Información importante</AlertTitle>
                        <AlertDescription>
                            Para realizar el pago de tus ventas online, necesitamos que completes tus datos bancarios.
                        </AlertDescription>
                    </Alert>
                    <div className="space-y-2">
                        <Label>Institución bancaria</Label>
                        <Controller name="bank" control={form.control} render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger><SelectValue placeholder="Selecciona un banco" /></SelectTrigger>
                                <SelectContent><SelectItem value="bbva">BBVA</SelectItem><SelectItem value="santander">Santander</SelectItem><SelectItem value="banamex">Citibanamex</SelectItem></SelectContent>
                            </Select>
                        )}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="account-holder">Nombre</Label>
                        <Controller name="accountHolder" control={form.control} render={({ field }) => (
                           <Input id="account-holder" {...field} placeholder="Nombre del titular de la cuenta" />
                        )}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clabe">CLABE interbancaria</Label>
                        <Controller name="clabe" control={form.control} render={({ field }) => (
                           <Input id="clabe" {...field} placeholder="Número de CLABE de 18 dígitos" />
                        )}/>
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border rounded-lg bg-card">
                <AccordionTrigger className="p-6 font-semibold text-base">Proveedores de pago externos</AccordionTrigger>
                <AccordionContent className="p-6 pt-0 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Si tienes una cuenta de MercadoPago puedes agregar tus propias credenciales para que las ventas se procesen a través de tu cuenta.
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="mercado-pago-public-key">Public Key</Label>
                        <Controller name="mercadoPagoPublicKey" control={form.control} render={({ field }) => (
                           <Input id="mercado-pago-public-key" {...field} placeholder="Tu Public Key de MercadoPago" />
                        )}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="mercado-pago-access-token">Access Token</Label>
                         <Controller name="mercadoPagoAccessToken" control={form.control} render={({ field }) => (
                           <Input id="mercado-pago-access-token" {...field} placeholder="Tu Access Token de MercadoPago" />
                        )}/>
                    </div>
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
