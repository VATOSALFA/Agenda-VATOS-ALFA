'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Globe, ListChecks, ShieldCheck, Image as ImageIcon, Award, Tag } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { ImageUploader } from '@/components/shared/image-uploader';
import { cn } from '@/lib/utils';
import { GaleriaCortesManager } from '@/components/admin/galeria-cortes-manager';
import { PaseAlfaManager } from '@/components/admin/pase-alfa-manager';
import PromotionsManager from '@/app/(admin)/settings/promotions/promotions-manager';

const customerFields = [
    { id: 'email', label: 'Correo electrónico' },
    { id: 'phone', label: 'Número telefónico' },
    { id: 'dob', label: 'Fecha de nacimiento' },
    { id: 'address', label: 'Dirección física' },
    { id: 'notes', label: 'Notas del cliente' },
];

export default function SitioWebPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('general');

    const form = useForm({
        defaultValues: {
            slogan: '',
            onlineReservations: true,
            marketVisibility: false,
            showHoursBy: 'professional',
            exclusiveForCreatedClients: false,
            allowClientNotes: true,
            heroDescription: '',
            description: '',
            slotInterval: 30,
            predefinedNotes: '',
            cancellableReservations: true,
            editableReservations: true,
            editPolicy: 'Los clientes pueden editar sus reservas hasta 2 horas antes.',
            maxEdits: 2,
            privacyPolicyEnabled: false,
            privacyUrl: '',
            privacyText: '',
            termsUrl: '',
            termsText: '',
            minReservationTime: 2,
            maxFutureTime: 30,
            professionalPreference: 'client_choice',
            reviewSystemEnabled: true,
            showReviews: 'all',
            customerFields: customerFields.reduce((acc, field) => {
                acc[field.id] = { use: true, required: ['email', 'phone'].includes(field.id) };
                return acc;
            }, {} as Record<string, { use: boolean; required: boolean }>),
            galleryTitle: 'GALERÍA ESTELAR',
            gallerySubtitle: 'Explora • Zoom • Inspírate',
            galleryCards: [] as { id: string; imageUrl: string; title: string; alt: string }[]
        }
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (!db) return;
            try {
                const docSnap = await getDoc(doc(db, 'settings', 'website'));
                if (docSnap.exists()) {
                    const data = docSnap.data();

                    let normalizedFields = { ...form.getValues().customerFields };

                    if (data.customerFields) {
                        normalizedFields = { ...normalizedFields, ...data.customerFields };
                    } else {
                        customerFields.forEach(field => {
                            if (data[field.id]) {
                                normalizedFields[field.id] = data[field.id];
                            }
                        });
                    }

                    form.reset({
                        ...form.getValues(),
                        ...data,
                        heroDescription: data.heroDescription || '',
                        description: data.description || '',
                        slotInterval: data.slotInterval || 30,
                        customerFields: normalizedFields
                    });
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            }
        };
        loadSettings();
    }, [db, form]);

    const onSubmit = async (data: any) => {
        if (!db) return;
        setIsSubmitting(true);
        try {
            const saveData: any = {
                ...data,
                minReservationTime: Number(data.minReservationTime || 1),
                maxFutureTime: Number(data.maxFutureTime || 14),
                customerFields: data.customerFields
            };

            customerFields.forEach(field => {
                delete saveData[field.id];
            });

            await setDoc(doc(db, 'settings', 'website'), saveData);
            toast({
                title: "Configuración guardada",
                description: "Los cambios en tu sitio web de reservas han sido actualizados."
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
    };

    return (
        <div className="flex-1 space-y-4 max-w-5xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Sitio Web</h2>
                    <p className="text-xs text-muted-foreground">
                        Configura el portal de agendamiento online, políticas, galería de cortes, Pase Alfa y promociones.
                    </p>
                </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto p-1 bg-muted/20 border border-border/60 rounded-xl">
                        <TabsTrigger
                            value="general"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>General</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="politicas"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Políticas</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="galeria"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <ImageIcon className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Galería</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="pase_alfa"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Award className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Pase Alfa</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="promociones"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer col-span-2 sm:col-span-1"
                        >
                            <Tag className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Promociones</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* 1. GENERAL (ENCABEZADO + CAMPOS DE CLIENTE) */}
                    <TabsContent value="general" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                        {/* 1. ENCABEZADO Y SLOGAN */}
                        <Card className="border border-border/70 shadow-xs overflow-hidden">
                            <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                        Encabezado y Slogan del Portal
                                    </CardTitle>
                                </div>
                                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                                    Personaliza el título principal y la descripción visible para tus clientes al entrar a agendar.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-3 sm:p-5 space-y-3.5">
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-xs font-semibold text-foreground">
                                            Título Principal (Slogan)
                                        </Label>
                                        <span className="text-[11px] text-muted-foreground font-sans">
                                            {(form.watch('slogan') || '').length}/80 caracteres
                                        </span>
                                    </div>
                                    <Input
                                        placeholder="Tu slogan principal (ej. No es solo un corte. Es tu mejor versión.)"
                                        maxLength={80}
                                        className="h-8 text-xs sm:text-sm"
                                        {...form.register('slogan')}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-xs font-semibold text-foreground">
                                            Subtítulo (Descripción de bienvenida)
                                        </Label>
                                        <span className="text-[11px] text-muted-foreground font-sans">
                                            {(form.watch('heroDescription') || '').length}/250 caracteres
                                        </span>
                                    </div>
                                    <Textarea
                                        placeholder="Agenda tu cita en segundos con nuestros Master Barbers. Cortes clásicos, fades de alta precisión y el tradicional ritual de toalla caliente."
                                        maxLength={250}
                                        rows={3}
                                        className="text-xs sm:text-sm resize-none"
                                        {...form.register('heroDescription')}
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Texto visible inmediatamente debajo del título principal en el Hero. Máximo 250 caracteres.
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-xs font-semibold text-foreground">
                                            Descripción (Debajo del Hero)
                                        </Label>
                                        <span className="text-[11px] text-muted-foreground font-sans">
                                            {(form.watch('description') || '').length}/450 caracteres
                                        </span>
                                    </div>
                                    <Textarea
                                        placeholder="En VATOS ALFA Barber Shop dominamos desde los cortes clásicos y desvanecidos (fades) más limpios, hasta el perfilado de barba con el tradicional ritual de toalla caliente..."
                                        maxLength={450}
                                        rows={4}
                                        className="text-xs sm:text-sm resize-none"
                                        {...form.register('description')}
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Párrafo informativo que se muestra en la página web inmediatamente abajo del Hero. Máximo 450 caracteres.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. CAMPOS REQUERIDOS AL AGENDAR (TABLA COMPACTA - REGLA 6) */}
                        <Card className="border border-border/70 shadow-xs overflow-hidden">
                            <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                                <div className="flex items-center gap-2">
                                    <ListChecks className="h-4 w-4 text-slate-400 shrink-0" />
                                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                        Datos Solicitados al Cliente
                                    </CardTitle>
                                </div>
                                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                                    Elige qué datos pedir al cliente en el formulario de reserva online y cuáles son obligatorios.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                            <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground">Campo de Registro</TableHead>
                                            <TableHead className="py-1 px-3 text-center text-xs font-semibold text-foreground w-36">Solicitar</TableHead>
                                            <TableHead className="py-1 px-3 text-center text-xs font-semibold text-foreground w-36">Obligatorio</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {customerFields.map(field => (
                                            <TableRow key={field.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                <TableCell className="py-1.5 px-3.5 text-xs font-medium text-foreground">
                                                    {field.label}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-center">
                                                    <Switch
                                                        className="scale-90"
                                                        checked={form.watch(`customerFields.${field.id}.use`)}
                                                        onCheckedChange={(checked) => form.setValue(`customerFields.${field.id}.use`, checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-center">
                                                    <Switch
                                                        className="scale-90"
                                                        checked={form.watch(`customerFields.${field.id}.required`)}
                                                        onCheckedChange={(checked) => form.setValue(`customerFields.${field.id}.required`, checked)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 2. POLÍTICAS Y AVISO LEGAL */}
                    <TabsContent value="politicas" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                        <Card className="border border-border/70 shadow-xs overflow-hidden">
                            <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
                                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                            Políticas y Términos Legales
                                        </CardTitle>
                                    </div>
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
                                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                                    Obliga al cliente a aceptar tus políticas de cancelación y términos antes de reservar.
                                </CardDescription>
                            </CardHeader>

                            {form.watch('privacyPolicyEnabled') && (
                                <CardContent className="p-3 sm:p-5 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                                        {/* Aviso de Privacidad */}
                                        <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/5">
                                            <h4 className="text-xs font-semibold text-foreground">Aviso de Privacidad</h4>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-muted-foreground">URL Externa (opcional)</Label>
                                                <Input
                                                    placeholder="https://vatosalfa.com/privacidad"
                                                    className="h-8 text-xs font-sans"
                                                    {...form.register('privacyUrl')}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-muted-foreground">O redacta el texto</Label>
                                                <Textarea
                                                    placeholder="Escribe aquí tu aviso de privacidad..."
                                                    rows={3}
                                                    className="text-xs resize-none"
                                                    {...form.register('privacyText')}
                                                />
                                            </div>
                                        </div>

                                        {/* Términos y Condiciones */}
                                        <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/5">
                                            <h4 className="text-xs font-semibold text-foreground">Términos y Condiciones</h4>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-muted-foreground">URL Externa (opcional)</Label>
                                                <Input
                                                    placeholder="https://vatosalfa.com/terminos"
                                                    className="h-8 text-xs font-sans"
                                                    {...form.register('termsUrl')}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-muted-foreground">O redacta el texto</Label>
                                                <Textarea
                                                    placeholder="Escribe aquí tus términos y condiciones..."
                                                    rows={3}
                                                    className="text-xs resize-none"
                                                    {...form.register('termsText')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    </TabsContent>

                    {/* 3. GALERÍA DE CORTES (ESPEJO CON APP MÓVIL) */}
                    <TabsContent value="galeria" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                        <GaleriaCortesManager />
                    </TabsContent>

                    {/* 4. PASE ALFA (ESPEJO CON APP MÓVIL) */}
                    <TabsContent value="pase_alfa" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                        <PaseAlfaManager />
                    </TabsContent>

                    {/* 5. PROMOCIONES (ESPEJO CON APP MÓVIL) */}
                    <TabsContent value="promociones" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                        <PromotionsManager hideHeader />
                    </TabsContent>
                </Tabs>

                {/* Botón Guardar Cambios (Alfa) - Solo visible en General y Políticas */}
                {['general', 'politicas'].includes(activeTab) && (
                    <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex justify-end">
                        <Button
                            type="submit"
                            variant="alfa"
                            disabled={isSubmitting}
                            className="h-9 px-6 text-xs font-semibold"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                "Guardar Cambios"
                            )}
                        </Button>
                    </div>
                )}
            </form>
        </div>
    );
}
