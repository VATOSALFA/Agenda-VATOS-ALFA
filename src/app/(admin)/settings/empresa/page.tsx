'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Loader2, Building2, Sparkles, Palette, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { useForm, Controller } from "react-hook-form";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useEffect, useState } from "react";
import { ImageUploader } from "@/components/shared/image-uploader";
import { ColorPicker } from '@/components/settings/empresa/color-picker';
import { useTheme } from "@/components/layout/theme-provider";
import { cn } from "@/lib/utils";

interface EmpresaSettings {
    id?: string;
    name: string;
    description: string;
    website_slug: string;
    logo_url: string;
    icon_url?: string;
    receipt_logo_url?: string;
    theme?: {
        primaryColor?: string;
        secondaryColor?: string;
        accentColor?: string;
        backgroundColor?: string;
        foreground?: string;
        cardColor?: string;
        goldColor?: string;
        buttonNavyColor?: string;
        accentBlueColor?: string;
        dangerColor?: string;
        headerDarkColor?: string;
        agendaReservadoColor?: string;
        agendaConfirmadoColor?: string;
        agendaEnEsperaColor?: string;
        agendaAsisteColor?: string;
        agendaNoAsisteColor?: string;
        agendaPendienteColor?: string;
        agendaPagoCompletoColor?: string;
        agendaAnticipoColor?: string;
        agendaCanceladoColor?: string;
    };
}

export default function EmpresaPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { setThemeColors } = useTheme();

    const { data, loading } = useFirestoreQuery<EmpresaSettings>('empresa');
    const settings = data?.[0] || { id: 'main', name: 'VATOS ALFA', description: '', website_slug: 'vatosalfa--agenda-1ae08.us-central1.hosted.app', logo_url: '', icon_url: '' };

    const form = useForm<EmpresaSettings>({
        defaultValues: settings
    });

    const [primaryColor, setPrimaryColor] = useState('#202A49');
    const [secondaryColor, setSecondaryColor] = useState('#314177');
    const [accentColor, setAccentColor] = useState('#C9C9C9');
    const [backgroundColor, setBackgroundColor] = useState('#F8F9FC');
    const [foregroundColor, setForegroundColor] = useState('#000000');
    const [cardColor, setCardColor] = useState('#FFFFFF');
    // Nuevos colores solicitados para la paleta institucional
    const [goldColor, setGoldColor] = useState('#C5A880');
    const [buttonNavyColor, setButtonNavyColor] = useState('#202A49');
    const [accentBlueColor, setAccentBlueColor] = useState('#3B82F6');
    const [dangerColor, setDangerColor] = useState('#EF4444');
    const [headerDarkColor, setHeaderDarkColor] = useState('#10172B');

    // Colores oficiales de los estados de la Agenda
    const [agendaReservadoColor, setAgendaReservadoColor] = useState('#93C5FD');
    const [agendaConfirmadoColor, setAgendaConfirmadoColor] = useState('#FDE047');
    const [agendaEnEsperaColor, setAgendaEnEsperaColor] = useState('#86EFAC');
    const [agendaAsisteColor, setAgendaAsisteColor] = useState('#F9A8D4');
    const [agendaNoAsisteColor, setAgendaNoAsisteColor] = useState('#FDBA74');
    const [agendaPendienteColor, setAgendaPendienteColor] = useState('#FCA5A5');
    const [agendaPagoCompletoColor, setAgendaPagoCompletoColor] = useState('#22C55E');
    const [agendaAnticipoColor, setAgendaAnticipoColor] = useState('#F97316');
    const [agendaCanceladoColor, setAgendaCanceladoColor] = useState('#D1D5DB');

    useEffect(() => {
        if (!loading && data.length > 0) {
            const currentSettings = data[0];
            form.reset(currentSettings);
            if (currentSettings.theme) {
                setPrimaryColor(currentSettings.theme.primaryColor || '#202A49');
                setSecondaryColor(currentSettings.theme.secondaryColor || '#314177');
                setAccentColor(currentSettings.theme.accentColor || '#C9C9C9');
                setBackgroundColor(currentSettings.theme.backgroundColor || '#F8F9FC');
                setForegroundColor(currentSettings.theme.foreground || '#000000');
                setCardColor(currentSettings.theme.cardColor || '#FFFFFF');
                setGoldColor(currentSettings.theme.goldColor || '#C5A880');
                setButtonNavyColor(currentSettings.theme.buttonNavyColor || '#202A49');
                setAccentBlueColor(currentSettings.theme.accentBlueColor || '#3B82F6');
                setDangerColor(currentSettings.theme.dangerColor || '#EF4444');
                setHeaderDarkColor(currentSettings.theme.headerDarkColor || '#10172B');
                setAgendaReservadoColor(currentSettings.theme.agendaReservadoColor || '#93C5FD');
                setAgendaConfirmadoColor(currentSettings.theme.agendaConfirmadoColor || '#FDE047');
                setAgendaEnEsperaColor(currentSettings.theme.agendaEnEsperaColor || '#86EFAC');
                setAgendaAsisteColor(currentSettings.theme.agendaAsisteColor || '#F9A8D4');
                setAgendaNoAsisteColor(currentSettings.theme.agendaNoAsisteColor || '#FDBA74');
                setAgendaPendienteColor(currentSettings.theme.agendaPendienteColor || '#FCA5A5');
                setAgendaPagoCompletoColor(currentSettings.theme.agendaPagoCompletoColor || '#22C55E');
                setAgendaAnticipoColor(currentSettings.theme.agendaAnticipoColor || '#F97316');
                setAgendaCanceladoColor(currentSettings.theme.agendaCanceladoColor || '#D1D5DB');
            }
        }
    }, [data, loading, form]);

    useEffect(() => {
        setThemeColors({
            primaryColor,
            secondaryColor,
            accentColor,
            backgroundColor,
            foreground: foregroundColor,
            cardColor,
            goldColor,
            buttonNavyColor,
            accentBlueColor,
            dangerColor,
            headerDarkColor,
            agendaReservadoColor,
            agendaConfirmadoColor,
            agendaEnEsperaColor,
            agendaAsisteColor,
            agendaNoAsisteColor,
            agendaPendienteColor,
            agendaPagoCompletoColor,
            agendaAnticipoColor,
            agendaCanceladoColor,
        });
    }, [
        primaryColor, secondaryColor, accentColor, backgroundColor, foregroundColor, cardColor,
        goldColor, buttonNavyColor, accentBlueColor, dangerColor, headerDarkColor,
        agendaReservadoColor, agendaConfirmadoColor, agendaEnEsperaColor, agendaAsisteColor,
        agendaNoAsisteColor, agendaPendienteColor, agendaPagoCompletoColor, agendaAnticipoColor,
        agendaCanceladoColor, setThemeColors
    ]);


    const websiteUrl = `https://${form.watch('website_slug') || 'vatosalfa--agenda-1ae08.us-central1.hosted.app'}`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(websiteUrl);
        toast({
            title: '¡Copiado!',
            description: 'El enlace a tu sitio web ha sido copiado al portapapeles.',
        });
    }

    const onSubmit = async (formData: EmpresaSettings) => {
        if (!db) {
            toast({
                variant: "destructive",
                title: "Error de base de datos",
                description: "No se pudo conectar con la base de datos.",
            });
            return;
        }
        if (!settings.id) {
            toast({
                variant: "destructive",
                title: "Error de configuración",
                description: "No se encontró el ID de la configuración de la empresa.",
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const dataToSave: EmpresaSettings = {
                ...formData,
                theme: {
                    primaryColor,
                    secondaryColor,
                    accentColor,
                    backgroundColor,
                    foreground: foregroundColor,
                    cardColor,
                    goldColor,
                    buttonNavyColor,
                    accentBlueColor,
                    dangerColor,
                    headerDarkColor,
                    agendaReservadoColor,
                    agendaConfirmadoColor,
                    agendaEnEsperaColor,
                    agendaAsisteColor,
                    agendaNoAsisteColor,
                    agendaPendienteColor,
                    agendaPagoCompletoColor,
                    agendaAnticipoColor,
                    agendaCanceladoColor,
                },
            };

            const settingsRef = doc(db, 'empresa', settings.id);
            await setDoc(settingsRef, dataToSave, { merge: true });

            toast({
                title: '¡Guardado!',
                description: 'La información de la empresa ha sido actualizada con éxito.',
            });
        } catch (error) {
            console.error("Error updating company settings:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo guardar la configuración. Inténtalo de nuevo.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex-1 space-y-4 max-w-5xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Empresa</h2>
                    <p className="text-xs text-muted-foreground">
                        Configura la identidad del negocio, logotipos, colores institucionales y tonos de agenda.
                    </p>
                </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <Tabs defaultValue="identidad" className="w-full space-y-4">
                    <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/20 border border-border/60 rounded-xl">
                        <TabsTrigger
                            value="identidad"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Identidad</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="branding"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Branding</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="colores"
                            className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Palette className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>Colores</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* 1. IDENTIDAD DEL NEGOCIO */}
                    <TabsContent value="identidad" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                        <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Identidad del Negocio</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                            Información principal de la empresa y enlace oficial a tu sitio web de agendamiento.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-5 space-y-3.5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-foreground">
                                    Nombre de tu empresa
                                </label>
                                <Input
                                    {...form.register('name')}
                                    className="h-9 text-xs sm:text-sm"
                                    placeholder="VATOS ALFA"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Aparecerá en el sitio web, recibos y avisos a clientes.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-foreground">
                                    Dirección web de agendamiento
                                </label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        {...form.register('website_slug')}
                                        className="h-9 text-xs sm:text-sm font-sans"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={copyToClipboard}
                                        className="h-9 px-3 shrink-0 text-xs gap-1.5 rounded-lg border-border/80 hover:bg-muted/50"
                                    >
                                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                                        <span className="hidden sm:inline">Copiar link</span>
                                    </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">
                                    URL pública: {websiteUrl}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-foreground">
                                    Descripción / Propuesta de Valor
                                </label>
                                <span className={cn(
                                    "text-[11px] font-sans",
                                    (form.watch('description')?.length || 0) >= 500 ? "text-destructive font-semibold" : "text-muted-foreground"
                                )}>
                                    {form.watch('description')?.length || 0}/500 caracteres
                                </span>
                            </div>
                            <Textarea
                                rows={3}
                                maxLength={500}
                                className="text-xs sm:text-sm resize-none"
                                placeholder="Cuéntale a tus clientes sobre tu empresa, servicios o experiencia..."
                                {...form.register('description')}
                                onChange={(e) => {
                                    form.setValue('description', e.target.value.slice(0, 500));
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            {/* 2. BRANDING Y LOGOTIPOS */}
            <TabsContent value="branding" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Branding y Logotipos</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                            Logotipo oficial y avatar para tu encabezado, portal web y comprobantes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-2.5 sm:p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                            {/* Logo */}
                            <div className="p-2.5 sm:p-3 rounded-xl border border-border/60 bg-muted/5 flex items-center gap-3">
                                <Controller
                                    name="logo_url"
                                    control={form.control}
                                    render={({ field }) => (
                                        <ImageUploader
                                            folder="logos"
                                            currentImageUrl={field.value}
                                            onUpload={(url) => field.onChange(url)}
                                            onRemove={() => field.onChange('')}
                                            compact={true}
                                            objectFit="contain"
                                        />
                                    )}
                                />
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <h4 className="text-xs font-semibold text-foreground truncate">Logo de Empresa</h4>
                                        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground shrink-0 border-border/60 hidden sm:inline-flex">
                                            Principal
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                                        Se mostrará en la barra superior, web y comprobantes.
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        PNG o WEBP fondo transparente.
                                    </p>
                                </div>
                            </div>

                            {/* Avatar */}
                            <div className="p-2.5 sm:p-3 rounded-xl border border-border/60 bg-muted/5 flex items-center gap-3">
                                <Controller
                                    name="icon_url"
                                    control={form.control}
                                    render={({ field }) => (
                                        <ImageUploader
                                            folder="logos"
                                            currentImageUrl={field.value}
                                            onUpload={(url) => field.onChange(url)}
                                            onRemove={() => field.onChange('')}
                                            compact={true}
                                            objectFit="cover"
                                        />
                                    )}
                                />
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <h4 className="text-xs font-semibold text-foreground truncate">Icono / Avatar</h4>
                                        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground shrink-0 border-border/60 hidden sm:inline-flex">
                                            Opcional
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                                        Favicon e icono de perfil cuadrado.
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        Recomendado: 500x500 px.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            {/* 3. COLORES DE INTERFAZ Y ESTADOS DE LA AGENDA */}
            <TabsContent value="colores" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden space-y-4" forceMount>
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <Palette className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Colores de Interfaz y Sistema VATOS ALFA
                            </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                            Configura la paleta institucional para botones, modales, alertas, portal web y comprobantes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                            <ColorPicker
                                label="Dorado Pase Alfa"
                                description="Pase Alfa Club, sellos e insignias VIP"
                                color={goldColor}
                                onChange={setGoldColor}
                                defaultColor="#C5A880"
                            />
                            <ColorPicker
                                label="Azul Botones Alfa"
                                description="Botones de acción principal y marca"
                                color={buttonNavyColor}
                                onChange={(c) => {
                                    setButtonNavyColor(c);
                                    setPrimaryColor(c);
                                }}
                                defaultColor="#202A49"
                            />
                            <ColorPicker
                                label="Azul Acento Móvil"
                                description="Bordes de modales, submenús y saldos positivos"
                                color={accentBlueColor}
                                onChange={(c) => {
                                    setAccentBlueColor(c);
                                    setAccentColor(c);
                                }}
                                defaultColor="#3B82F6"
                            />
                            <ColorPicker
                                label="Rojo Negativos / Alertas"
                                description="Saldos negativos, faltantes y errores de caja"
                                color={dangerColor}
                                onChange={setDangerColor}
                                defaultColor="#EF4444"
                            />
                            <ColorPicker
                                label="Azul Marino Cabeceras"
                                description="Fondo de encabezados de modales con haz de luz"
                                color={headerDarkColor}
                                onChange={setHeaderDarkColor}
                                defaultColor="#10172B"
                            />
                            <ColorPicker
                                label="Azul Secundario"
                                description="Subtítulos, acentos y comprobantes"
                                color={secondaryColor}
                                onChange={setSecondaryColor}
                                defaultColor="#314177"
                            />
                            <ColorPicker
                                label="Color de Fondo"
                                description="Lienzo de fondo del portal web y reservas"
                                color={backgroundColor}
                                onChange={setBackgroundColor}
                                defaultColor="#F8F9FC"
                            />
                            <ColorPicker
                                label="Color de Texto"
                                description="Tipografía y lectura"
                                color={foregroundColor}
                                onChange={setForegroundColor}
                                defaultColor="#000000"
                            />
                            <ColorPicker
                                label="Color de Tarjetas"
                                description="Superficie de módulos de servicios y tarjetas"
                                color={cardColor}
                                onChange={setCardColor}
                                defaultColor="#FFFFFF"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Colores de Estados de la Agenda */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Colores de Estados de la Agenda
                            </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                            Configura los colores oficiales de cada estado de cita e indicadores de pago en la agenda.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                            <ColorPicker
                                label="Reservado (Azul)"
                                description="Citas agendadas por recepción o web pública"
                                color={agendaReservadoColor}
                                onChange={setAgendaReservadoColor}
                                defaultColor="#93C5FD"
                            />
                            <ColorPicker
                                label="Confirmado (Amarillo)"
                                description="Citas con confirmación del cliente"
                                color={agendaConfirmadoColor}
                                onChange={setAgendaConfirmadoColor}
                                defaultColor="#FDE047"
                            />
                            <ColorPicker
                                label="En Espera (Verde)"
                                description="Cliente en recepción esperando turno"
                                color={agendaEnEsperaColor}
                                onChange={setAgendaEnEsperaColor}
                                defaultColor="#86EFAC"
                            />
                            <ColorPicker
                                label="Asiste (Rosa)"
                                description="Cliente en atención en sillón de barbero"
                                color={agendaAsisteColor}
                                onChange={setAgendaAsisteColor}
                                defaultColor="#F9A8D4"
                            />
                            <ColorPicker
                                label="No Asiste (Naranja)"
                                description="Citas con inasistencia del cliente"
                                color={agendaNoAsisteColor}
                                onChange={setAgendaNoAsisteColor}
                                defaultColor="#FDBA74"
                            />
                            <ColorPicker
                                label="Pendiente de Pago (Rojo)"
                                description="Citas con adeudo o saldo por liquidar"
                                color={agendaPendienteColor}
                                onChange={setAgendaPendienteColor}
                                defaultColor="#FCA5A5"
                            />
                            <ColorPicker
                                label="Pago Completo [$] (Verde)"
                                description="Distintivo de cita liquidada al 100%"
                                color={agendaPagoCompletoColor}
                                onChange={setAgendaPagoCompletoColor}
                                defaultColor="#22C55E"
                            />
                            <ColorPicker
                                label="Anticipo Pagado [A] (Naranja)"
                                description="Distintivo de anticipo o depósito registrado"
                                color={agendaAnticipoColor}
                                onChange={setAgendaAnticipoColor}
                                defaultColor="#F97316"
                            />
                            <ColorPicker
                                label="Cancelado (Gris)"
                                description="Citas canceladas tachadas en la agenda"
                                color={agendaCanceladoColor}
                                onChange={setAgendaCanceladoColor}
                                defaultColor="#D1D5DB"
                            />
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* Botón Guardar Cambios (Alfa) */}
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
            </form>
        </div>
    );
}
