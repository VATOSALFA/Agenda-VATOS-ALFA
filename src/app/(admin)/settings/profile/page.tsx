'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import {
    Loader2,
    User,
    KeyRound,
    Save,
    ShieldCheck,
    Volume2,
    VolumeX,
    Play,
    Check,
    Smartphone,
    MousePointerClick,
    Pencil,
    Type,
} from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/firebase-auth-context";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { ImageUploader } from "@/components/shared/image-uploader";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
    SOUND_STYLES,
    SoundStyle,
    FONT_SIZE_OPTIONS,
    FontSizeScale,
    applyFontSizeScale,
    getAudioSettings,
    setAudioSettings,
    playStrongNotificationAlert,
    triggerHapticAlert,
    playAgendaClickSound,
    initAudioUnlock,
} from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

const SOUND_OPTIONS: { id: SoundStyle; label: string }[] = [
    { id: 'alerta_insistente', label: 'Insistente' },
    { id: 'doble_campana', label: 'Campana' },
    { id: 'doble_triada', label: 'Tríada' },
];

const profileSchema = z.object({
    firstName: z.string().min(1, "El nombre es requerido."),
    lastName: z.string().min(1, "El apellido es requerido."),
    email: z.string().email("Email inválido."),
    avatarUrl: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
})
    .refine(data => {
        if (data.newPassword || data.confirmPassword) {
            return !!data.currentPassword;
        }
        return true;
    }, {
        message: "Debes ingresar tu contraseña actual para establecer una nueva.",
        path: ["currentPassword"],
    })
    .refine(data => {
        if (data.newPassword || data.currentPassword) {
            return data.newPassword === data.confirmPassword;
        }
        return true;
    }, {
        message: "Las contraseñas nuevas no coinciden.",
        path: ["confirmPassword"],
    });

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isEditingPersonal, setIsEditingPersonal] = useState(false);

    const toggleEditPersonal = () => {
        if (isEditingPersonal) {
            if (user) {
                const [firstName = '', ...lastNameParts] = user.displayName?.split(' ') || [];
                form.setValue('firstName', firstName);
                form.setValue('lastName', lastNameParts.join(' '));
                form.setValue('email', user.email || '');
            }
            setIsEditingPersonal(false);
        } else {
            setIsEditingPersonal(true);
        }
    };

    // Preferencias acústicas y visuales individuales (por usuario)
    const [notificationSound, setNotificationSound] = useState<SoundStyle>('alerta_insistente');
    const [notificationVolume, setNotificationVolume] = useState<number>(1.0);
    const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(true);
    const [agendaClickSoundEnabled, setAgendaClickSoundEnabled] = useState<boolean>(true);
    const [fontSizeScale, setFontSizeScale] = useState<FontSizeScale>('normal');

    const form = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
            avatarUrl: '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        }
    });

    useEffect(() => {
        initAudioUnlock();
        const local = getAudioSettings();
        setNotificationSound(local.notification_sound || 'alerta_insistente');
        setNotificationVolume(typeof local.notification_volume === 'number' ? local.notification_volume : 1.0);
        setVibrationEnabled(local.vibration_enabled !== false);
        setAgendaClickSoundEnabled(local.agenda_click_sound_enabled !== false);
        setFontSizeScale(local.font_size_scale || 'normal');
        applyFontSizeScale(local.font_size_scale || 'normal');
    }, []);

    useEffect(() => {
        if (user) {
            const [firstName = '', ...lastNameParts] = user.displayName?.split(' ') || [];
            form.reset({
                firstName,
                lastName: lastNameParts.join(' '),
                email: user.email || '',
                avatarUrl: user.avatarUrl || '',
            });

            // Si el perfil en Firestore contiene preferencias de audio y fuente, sincronizarlas
            const userAudio = (user as any).audio_settings;
            if (userAudio) {
                const style = userAudio.notification_sound || 'alerta_insistente';
                const vol = typeof userAudio.notification_volume === 'number' ? userAudio.notification_volume : 1.0;
                const vib = userAudio.vibration_enabled !== false;
                const click = userAudio.agenda_click_sound_enabled !== false;
                const scale = (userAudio.font_size_scale as FontSizeScale) || 'normal';
                setNotificationSound(style);
                setNotificationVolume(vol);
                setVibrationEnabled(vib);
                setAgendaClickSoundEnabled(click);
                setFontSizeScale(scale);
                setAudioSettings({
                    notification_sound: style,
                    notification_volume: vol,
                    vibration_enabled: vib,
                    agenda_click_sound_enabled: click,
                    font_size_scale: scale,
                });
            }
        }
    }, [user, form]);

    const handleFontSizeChange = (scale: FontSizeScale) => {
        setFontSizeScale(scale);
        setAudioSettings({ font_size_scale: scale });
    };

    const handleVolumeChange = (values: number[]) => {
        const vol = Math.round((values[0] ?? 100)) / 100;
        setNotificationVolume(vol);
        setAudioSettings({ notification_volume: vol });
    };

    const onSubmit = async (data: ProfileFormData) => {
        setIsSubmitting(true);
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el usuario.' });
            setIsSubmitting(false);
            return;
        }

        try {
            const userRef = doc(db, 'usuarios', user.uid);
            const fullName = `${data.firstName} ${data.lastName}`.trim();
            await updateDoc(userRef, {
                name: fullName,
                email: data.email,
                avatarUrl: data.avatarUrl,
                audio_settings: {
                    notification_sound: notificationSound,
                    notification_volume: notificationVolume,
                    vibration_enabled: vibrationEnabled,
                    agenda_click_sound_enabled: agendaClickSoundEnabled,
                    font_size_scale: fontSizeScale,
                },
            });

            // Guardar preferencias localmente para este navegador/dispositivo
            setAudioSettings({
                notification_sound: notificationSound,
                notification_volume: notificationVolume,
                vibration_enabled: vibrationEnabled,
                agenda_click_sound_enabled: agendaClickSoundEnabled,
                font_size_scale: fontSizeScale,
            });

            if (data.newPassword && data.currentPassword) {
                if (!user.email) throw new Error("User email is missing");

                const credential = EmailAuthProvider.credential(user.email, data.currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, data.newPassword);
                toast({ title: 'Contraseña actualizada correctamente' });
            }

            toast({
                title: "Perfil actualizado con éxito",
                description: "Tus datos personales, tamaño de texto y preferencias de sonido han sido guardados.",
            });
            setIsEditingPersonal(false);
            form.reset({
                ...form.getValues(),
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });

        } catch (error: any) {
            console.error("Error updating profile:", error);
            let description = "No se pudo actualizar el perfil.";
            if (error.code === 'auth/requires-recent-login') {
                description = "Esta operación es sensible y requiere un inicio de sesión reciente. Por favor, cierra sesión y vuelve a iniciarla.";
            } else if (error.code === 'auth/wrong-password') {
                description = "La contraseña actual es incorrecta.";
            }
            toast({ variant: 'destructive', title: 'Error', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 space-y-4 max-w-5xl pb-6">
            {/* Header Oficial */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Mi Perfil</h2>
                    <p className="text-xs text-muted-foreground hidden sm:block">
                        Administra tu información personal, avatar, credenciales y preferencias visuales y acústicas.
                    </p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <Tabs defaultValue="perfil" className="w-full space-y-4">
                        <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/20 border border-border/60 rounded-xl">
                            <TabsTrigger
                                value="perfil"
                                className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                            >
                                <User className="h-4 w-4 text-slate-400 shrink-0" />
                                <span>Perfil</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="seguridad"
                                className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                            >
                                <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
                                <span>Seguridad</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="sonidos"
                                className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                            >
                                <Volume2 className="h-4 w-4 text-slate-400 shrink-0" />
                                <span>Preferencias</span>
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB 1: PERFIL */}
                        <TabsContent value="perfil" forceMount className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none">
                            {/* Tarjeta de Resumen y Avatar */}
                            <Card className="border border-border/60 shadow-xs overflow-hidden">
                                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                                    <Controller
                                        name="avatarUrl"
                                        control={form.control}
                                        render={({ field }) => (
                                            <ImageUploader
                                                folder="profesionales"
                                                currentImageUrl={field.value}
                                                onUploadStateChange={setIsUploading}
                                                onUpload={(url) => field.onChange(url)}
                                                onRemove={() => field.onChange('')}
                                            />
                                        )}
                                    />
                                    <div className="text-center sm:text-left min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                            <h3 className="text-base font-bold text-foreground">{user?.displayName || "Usuario"}</h3>
                                            <Badge variant="outline" className="text-[10px] text-muted-foreground capitalize border-border/60">
                                                {user?.role || "Staff"}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {user?.email || "Sin correo electrónico"}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground/80 mt-1">
                                            Los cambios realizados en tu perfil se reflejarán en tu sesión y en el registro de auditoría.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Información Personal */}
                            <Card className="border border-border/60 shadow-xs overflow-hidden">
                                <CardHeader className="py-2.5 px-4 sm:px-5 border-b border-border/50 bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-slate-400 shrink-0" />
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Información Personal</CardTitle>
                                                <CardDescription className="text-xs">Datos de identificación y contacto</CardDescription>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleEditPersonal}
                                            className={cn(
                                                "h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer",
                                                isEditingPersonal && "text-blue-400 hover:text-blue-300 bg-blue-500/10"
                                            )}
                                            title={isEditingPersonal ? "Cancelar edición" : "Editar información"}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-5 space-y-3.5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <FormField
                                            control={form.control}
                                            name="firstName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Label className="text-xs font-medium">Nombres</Label>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            readOnly={!isEditingPersonal}
                                                            className={cn(
                                                                "h-8.5 text-xs font-sans transition-colors",
                                                                !isEditingPersonal
                                                                    ? "bg-muted/30 cursor-default select-text border-border/40 text-foreground"
                                                                    : "bg-background border-blue-500/60 focus-visible:ring-1 focus-visible:ring-blue-500"
                                                            )}
                                                        />
                                                    </FormControl>
                                                    <FormMessage className="text-[11px]" />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="lastName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Label className="text-xs font-medium">Apellidos</Label>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            readOnly={!isEditingPersonal}
                                                            className={cn(
                                                                "h-8.5 text-xs font-sans transition-colors",
                                                                !isEditingPersonal
                                                                    ? "bg-muted/30 cursor-default select-text border-border/40 text-foreground"
                                                                    : "bg-background border-blue-500/60 focus-visible:ring-1 focus-visible:ring-blue-500"
                                                            )}
                                                        />
                                                    </FormControl>
                                                    <FormMessage className="text-[11px]" />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Label className="text-xs font-medium">Correo Electrónico</Label>
                                                <FormControl>
                                                    <Input
                                                        type="email"
                                                        {...field}
                                                        readOnly={!isEditingPersonal}
                                                        className={cn(
                                                            "h-8.5 text-xs font-sans transition-colors",
                                                            !isEditingPersonal
                                                                ? "bg-muted/30 cursor-default select-text border-border/40 text-foreground"
                                                                : "bg-background border-blue-500/60 focus-visible:ring-1 focus-visible:ring-blue-500"
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormMessage className="text-[11px]" />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>

                            {/* Tamaño de Letra de la Plataforma (también accesible desde la pestaña principal Perfil) */}
                            <Card className="border border-border/60 shadow-xs overflow-hidden">
                                <CardHeader className="py-2.5 px-4 sm:px-5 border-b border-border/50 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                        <Type className="h-4 w-4 text-slate-400 shrink-0" />
                                        <div>
                                            <CardTitle className="text-sm font-semibold">Tamaño de Letra de la Plataforma</CardTitle>
                                            <CardDescription className="text-xs">
                                                Ajusta la escala tipográfica de toda la interfaz según tu preferencia visual
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-5">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {FONT_SIZE_OPTIONS.map((option) => {
                                            const isSelected = fontSizeScale === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => handleFontSizeChange(option.id)}
                                                    className={cn(
                                                        "flex flex-col items-start justify-between p-3 rounded-xl border text-left transition-all cursor-pointer",
                                                        isSelected
                                                            ? "border-2 border-blue-500 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.12)]"
                                                            : "border-border/60 bg-card hover:bg-muted/20"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between w-full mb-1">
                                                        <span className={cn(
                                                            "font-semibold text-xs",
                                                            isSelected ? "text-blue-500 dark:text-blue-400" : "text-foreground"
                                                        )}>
                                                            {option.label}
                                                        </span>
                                                        <Type className={cn(
                                                            "text-slate-400 shrink-0",
                                                            option.id === 'compacto' && "h-3 w-3",
                                                            option.id === 'normal' && "h-3.5 w-3.5",
                                                            option.id === 'grande' && "h-4 w-4",
                                                            option.id === 'extra_grande' && "h-4.5 w-4.5"
                                                        )} />
                                                    </div>
                                                    <span className="text-[11px] text-muted-foreground leading-snug">
                                                        {option.description}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 2: SEGURIDAD */}
                        <TabsContent value="seguridad" forceMount className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none">
                            <Card className="border border-border/60 shadow-xs overflow-hidden">
                                <CardHeader className="py-2.5 px-4 sm:px-5 border-b border-border/50 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                        <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
                                        <div>
                                            <CardTitle className="text-sm font-semibold">Seguridad de la Cuenta</CardTitle>
                                            <CardDescription className="text-xs">Actualización de contraseña de acceso</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-5 space-y-3">
                                    <FormField
                                        control={form.control}
                                        name="currentPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Label className="text-xs font-medium">Contraseña Actual</Label>
                                                <FormControl><Input type="password" {...field} autoComplete="off" className="h-8.5 text-xs font-sans" placeholder="••••••••" /></FormControl>
                                                <FormMessage className="text-[11px]" />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <FormField
                                            control={form.control}
                                            name="newPassword"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Label className="text-xs font-medium">Nueva Contraseña</Label>
                                                    <FormControl><Input type="password" {...field} autoComplete="off" className="h-8.5 text-xs font-sans" placeholder="Mínimo 6 caracteres" /></FormControl>
                                                    <FormMessage className="text-[11px]" />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="confirmPassword"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Label className="text-xs font-medium">Confirmar Contraseña</Label>
                                                    <FormControl><Input type="password" {...field} autoComplete="off" className="h-8.5 text-xs font-sans" placeholder="Repite la contraseña" /></FormControl>
                                                    <FormMessage className="text-[11px]" />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 3: PREFERENCIAS Y SONIDOS */}
                        <TabsContent value="sonidos" forceMount className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none">
                            {/* Tarjeta de Tamaño de Letra también disponible en Preferencias */}
                            <Card className="border border-border/60 shadow-xs overflow-hidden">
                                <CardHeader className="py-2.5 px-4 sm:px-5 border-b border-border/50 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                        <Type className="h-4 w-4 text-slate-400 shrink-0" />
                                        <div>
                                            <CardTitle className="text-sm font-semibold">Tamaño de Letra de la Plataforma</CardTitle>
                                            <CardDescription className="text-xs">
                                                El cambio se aplica al instante en toda la plataforma
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-5">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {FONT_SIZE_OPTIONS.map((option) => {
                                            const isSelected = fontSizeScale === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => handleFontSizeChange(option.id)}
                                                    className={cn(
                                                        "flex flex-col items-start justify-between p-3 rounded-xl border text-left transition-all cursor-pointer",
                                                        isSelected
                                                            ? "border-2 border-blue-500 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.12)]"
                                                            : "border-border/60 bg-card hover:bg-muted/20"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between w-full mb-1">
                                                        <span className={cn(
                                                            "font-semibold text-xs",
                                                            isSelected ? "text-blue-500 dark:text-blue-400" : "text-foreground"
                                                        )}>
                                                            {option.label}
                                                        </span>
                                                        <Type className={cn(
                                                            "text-slate-400 shrink-0",
                                                            option.id === 'compacto' && "h-3 w-3",
                                                            option.id === 'normal' && "h-3.5 w-3.5",
                                                            option.id === 'grande' && "h-4 w-4",
                                                            option.id === 'extra_grande' && "h-4.5 w-4.5"
                                                        )} />
                                                    </div>
                                                    <span className="text-[11px] text-muted-foreground leading-snug">
                                                        {option.description}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-border/60 shadow-xs overflow-hidden">
                                <CardHeader className="py-2.5 px-4 sm:px-5 border-b border-border/50 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                        <Volume2 className="h-4 w-4 text-slate-400 shrink-0" />
                                        <div>
                                            <CardTitle className="text-sm font-semibold">Tonos y Volumen de Notificaciones</CardTitle>
                                            <CardDescription className="text-xs">
                                                Personaliza el volumen, tono de alerta, vibración y clic táctil exclusivos para tu cuenta
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-5 space-y-4">
                                    {/* Control de Volumen de Sonidos */}
                                    <div className="rounded-xl border border-border/60 p-3.5 bg-card space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                {notificationVolume <= 0.01 ? (
                                                    <VolumeX className="h-4 w-4 text-slate-400 shrink-0" />
                                                ) : (
                                                    <Volume2 className="h-4 w-4 text-slate-400 shrink-0" />
                                                )}
                                                <Label className="text-xs sm:text-sm font-semibold text-foreground">
                                                    Volumen de Sonidos de Notificación
                                                </Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-foreground font-sans">
                                                    {Math.round(notificationVolume * 100)}%
                                                </span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => playStrongNotificationAlert({
                                                        style: notificationSound,
                                                        volume: notificationVolume,
                                                        vibrate: vibrationEnabled,
                                                    })}
                                                    className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg border-border/80"
                                                >
                                                    Probar
                                                </Button>
                                            </div>
                                        </div>
                                        <Slider
                                            value={[Math.round(notificationVolume * 100)]}
                                            min={0}
                                            max={100}
                                            step={5}
                                            onValueChange={handleVolumeChange}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground font-sans">
                                            <span>Silencio (0%)</span>
                                            <span>Medio (50%)</span>
                                            <span>Máximo (100%)</span>
                                        </div>
                                    </div>

                                    {/* Selector de tonos como lista simple */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-foreground">
                                            Tono de Notificación para Nuevas Citas y Avisos
                                        </Label>
                                        <div className="rounded-xl border border-border/60 divide-y divide-border/50 bg-card overflow-hidden">
                                            {SOUND_OPTIONS.map((sound) => {
                                                const isSelected = notificationSound === sound.id;
                                                return (
                                                    <div
                                                        key={sound.id}
                                                        onClick={() => {
                                                            setNotificationSound(sound.id);
                                                            playStrongNotificationAlert({
                                                                style: sound.id,
                                                                volume: notificationVolume,
                                                                vibrate: vibrationEnabled,
                                                            });
                                                        }}
                                                        className={cn(
                                                            "flex items-center justify-between p-3 sm:px-4 cursor-pointer transition-colors",
                                                            isSelected ? "bg-blue-500/5 hover:bg-blue-500/10" : "hover:bg-muted/20"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "h-4 w-4 rounded-full border flex items-center justify-center transition-colors",
                                                                isSelected ? "border-blue-500" : "border-slate-500"
                                                            )}>
                                                                {isSelected && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                                            </div>
                                                            <span className={cn(
                                                                "text-xs sm:text-sm transition-colors",
                                                                isSelected ? "font-semibold text-foreground" : "text-foreground/80 font-medium"
                                                            )}>
                                                                {sound.label}
                                                            </span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setNotificationSound(sound.id);
                                                                playStrongNotificationAlert({
                                                                    style: sound.id,
                                                                    volume: notificationVolume,
                                                                    vibrate: vibrationEnabled,
                                                                });
                                                            }}
                                                            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                                            title={`Escuchar ${sound.label}`}
                                                            aria-label={`Escuchar ${sound.label}`}
                                                        >
                                                            <Play className="h-4 w-4 fill-current text-slate-400 hover:text-white transition-colors" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="rounded-xl border border-border/60 divide-y divide-border/50 bg-card overflow-hidden">
                                        {/* Toggle 1: Vibración */}
                                        <div className="flex items-center justify-between p-3 sm:p-3.5">
                                            <div className="space-y-0.5 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <Smartphone className="h-4 w-4 text-slate-400 shrink-0" />
                                                    <label htmlFor="profile-vibration-toggle" className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground">
                                                        Vibración Háptica en Dispositivos Móviles
                                                    </label>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground hidden sm:block">
                                                    Vibración de confirmación en tablets o celulares al recibir una notificación.
                                                </p>
                                            </div>
                                            <Switch
                                                id="profile-vibration-toggle"
                                                checked={vibrationEnabled}
                                                onCheckedChange={(checked) => {
                                                    setVibrationEnabled(checked);
                                                    if (checked) {
                                                        triggerHapticAlert();
                                                    }
                                                }}
                                            />
                                        </div>

                                        {/* Toggle 2: Clic interactivo */}
                                        <div className="flex items-center justify-between p-3 sm:p-3.5">
                                            <div className="space-y-0.5 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <MousePointerClick className="h-4 w-4 text-slate-400 shrink-0" />
                                                    <label htmlFor="profile-agenda-click-toggle" className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground">
                                                        Sonido de Clic al Interactuar en la Agenda
                                                    </label>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground hidden sm:block">
                                                    Clic táctil sutil al interactuar con citas, celdas y botones de la agenda.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => playAgendaClickSound(0.28)}
                                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg border-border/80"
                                                >
                                                    Probar
                                                </Button>
                                                <Switch
                                                    id="profile-agenda-click-toggle"
                                                    checked={agendaClickSoundEnabled}
                                                    onCheckedChange={(checked) => {
                                                        setAgendaClickSoundEnabled(checked);
                                                        if (checked) {
                                                            playAgendaClickSound(0.28);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
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
                            disabled={isSubmitting || isUploading}
                            className="h-9 px-6 text-xs font-semibold gap-1.5"
                        >
                            {(isSubmitting || isUploading) ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="h-3.5 w-3.5" />
                                    <span>Guardar Cambios</span>
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
