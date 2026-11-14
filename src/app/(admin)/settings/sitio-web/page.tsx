'use client';

import { useForm } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, Suspense } from "react";
import { Loader2, FileText, X, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/firebase-auth-context';

const customerFields = [
    { id: 'email', label: 'Correo electrónico' },
    { id: 'phone', label: 'Número telefónico' },
    { id: 'dob', label: 'Fecha de nacimiento' },
    { id: 'address', label: 'Dirección física' },
    { id: 'notes', label: 'Notas del cliente' },
];

function SitioWebContent() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [expandedEditor, setExpandedEditor] = useState<{
        open: boolean;
        title: string;
        description: string;
        field: 'slogan' | 'heroDescription' | 'description' | 'termsText' | 'privacyText';
        maxLength?: number;
    }>({
        open: false,
        title: '',
        description: '',
        field: 'slogan',
    });
    const [expandedText, setExpandedText] = useState('');
    const [isGoogleReviewsOpen, setIsGoogleReviewsOpen] = useState(false);
    const [isCustomerFieldsOpen, setIsCustomerFieldsOpen] = useState(false);

    const openExpandedEditor = (
        title: string,
        description: string,
        field: 'slogan' | 'heroDescription' | 'description' | 'termsText' | 'privacyText',
        maxLength?: number
    ) => {
        setExpandedText(form.getValues(field) || '');
        setExpandedEditor({
            open: true,
            title,
            description,
            field,
            maxLength,
        });
    };

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
            googleRating: 4.5,
            googleReviewCount: 102,
            googlePlaceId: 'ChIJxQ4hagBb04URwQM4y5UsX-U',
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
                        googleRating: data.googleRating !== undefined ? data.googleRating : 4.5,
                        googleReviewCount: data.googleReviewCount !== undefined ? data.googleReviewCount : 102,
                        googlePlaceId: data.googlePlaceId || 'ChIJxQ4hagBb04URwQM4y5UsX-U',
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
                googleRating: typeof data.googleRating === 'number' && !isNaN(data.googleRating) ? data.googleRating : 4.5,
                googleReviewCount: typeof data.googleReviewCount === 'number' && !isNaN(data.googleReviewCount) ? data.googleReviewCount : 102,
                googlePlaceId: data.googlePlaceId || 'ChIJxQ4hagBb04URwQM4y5UsX-U',
                minReservationTime: Number(data.minReservationTime || 1),
                maxFutureTime: Number(data.maxFutureTime || 14),
                customerFields: data.customerFields
            };

            customerFields.forEach(field => {
                delete saveData[field.id];
            });

            await setDoc(doc(db, 'settings', 'website'), saveData, { merge: true });
            await setDoc(doc(db, 'configuracion', 'app_movil'), {
                terminos_generales: saveData.termsText || '',
                aviso_privacidad: saveData.privacyText || '',
            }, { merge: true });
            toast({
                title: "Configuración guardada",
                description: "Los términos, políticas y ajustes se han sincronizado en el Sitio Web y la App Móvil."
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
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border/60">
                <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">SITIO WEB</h2>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* 1. CAMPOS DE TEXTO DEL PORTAL EN FILAS LIMPIAS (ABREN MODAL) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardContent className="p-0 divide-y divide-border/60">
                        {/* Fila 1: Título Principal (Slogan) */}
                        <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-foreground">
                                    Título Principal (Slogan)
                                </span>
                                {form.watch('slogan') && (
                                    <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                                        ({(form.watch('slogan') || '').length}/80)
                                    </span>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openExpandedEditor(
                                    'Título Principal (Slogan)',
                                    'Personaliza el lema principal que encabeza el portal web de reservas.',
                                    'slogan',
                                    80
                                )}
                                className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                            >
                                Editar
                            </Button>
                        </div>

                        {/* Fila 2: Subtítulo (Descripción de bienvenida) */}
                        <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-foreground">
                                    Subtítulo (Descripción de bienvenida)
                                </span>
                                {form.watch('heroDescription') && (
                                    <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                                        ({(form.watch('heroDescription') || '').length}/250)
                                    </span>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openExpandedEditor(
                                    'Subtítulo (Descripción de bienvenida)',
                                    'Texto visible inmediatamente debajo del título principal en el Hero.',
                                    'heroDescription',
                                    250
                                )}
                                className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                            >
                                Editar
                            </Button>
                        </div>

                        {/* Fila 3: Descripción (Debajo del Hero) */}
                        <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-foreground">
                                    Descripción (Debajo del Hero)
                                </span>
                                {form.watch('description') && (
                                    <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                                        ({(form.watch('description') || '').length}/450)
                                    </span>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openExpandedEditor(
                                    'Descripción (Debajo del Hero)',
                                    'Párrafo informativo que se muestra en la página web inmediatamente abajo del Hero.',
                                    'description',
                                    450
                                )}
                                className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                            >
                                Editar
                            </Button>
                        </div>

                        {/* Fila 4: Términos y Condiciones */}
                        <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-foreground">
                                    Términos y Condiciones Generales
                                </span>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openExpandedEditor(
                                    'Términos y Condiciones Generales de Servicio',
                                    'Este texto se actualiza en tiempo real en /terminos, en el modal de reserva y en la App Móvil.',
                                    'termsText'
                                )}
                                className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                            >
                                Editar
                            </Button>
                        </div>

                        {/* Fila 5: Aviso de Privacidad */}
                        <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-foreground">
                                    Aviso de Privacidad
                                </span>
                                {form.watch('privacyPolicyEnabled') && (
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-sans font-medium text-blue-400 border-blue-500/40 bg-blue-500/10">
                                        Aceptación requerida
                                    </Badge>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openExpandedEditor(
                                    'Aviso de Privacidad Integral',
                                    'Este texto se actualiza en tiempo real en /privacidad, en el modal de reserva y en la App Móvil.',
                                    'privacyText'
                                )}
                                className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                            >
                                Editar
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. CALIFICACIÓN Y OPINIONES DE GOOGLE MAPS (SIN ICONO, MINIMIZABLE) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                    Calificación y Opiniones en Google Maps
                                </CardTitle>
                                <a
                                    href="https://www.google.com/maps/place/?q=place_id:ChIJxQ4hagBb04URwQM4y5UsX-U"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 font-medium ml-2"
                                >
                                    Ver en Google Maps <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsGoogleReviewsOpen(!isGoogleReviewsOpen)}
                                className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                                title={isGoogleReviewsOpen ? "Minimizar" : "Maximizar"}
                                aria-label={isGoogleReviewsOpen ? "Minimizar" : "Maximizar"}
                            >
                                {isGoogleReviewsOpen ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </CardHeader>
                    {isGoogleReviewsOpen && (
                        <CardContent className="p-3 sm:p-5 space-y-3.5 animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Calificación (Estrellas)
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="1"
                                        max="5"
                                        placeholder="4.5"
                                        className="h-8 text-xs sm:text-sm font-sans"
                                        {...form.register('googleRating', { valueAsNumber: true })}
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Ej: 4.5 (se refleja en estrellas doradas).
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Total de Opiniones Reales
                                    </Label>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        placeholder="102"
                                        className="h-8 text-xs sm:text-sm font-sans"
                                        {...form.register('googleReviewCount', { valueAsNumber: true })}
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Ej: 102 opiniones en Google.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Google Place ID
                                    </Label>
                                    <Input
                                        placeholder="ChIJxQ4hagBb04URwQM4y5UsX-U"
                                        className="h-8 text-xs sm:text-sm font-mono"
                                        {...form.register('googlePlaceId')}
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        ID del negocio en Google Maps.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* 3. CAMPOS REQUERIDOS AL AGENDAR (SIN ICONO, MINIMIZABLE) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Datos Solicitados al Cliente
                            </CardTitle>
                            <button
                                type="button"
                                onClick={() => setIsCustomerFieldsOpen(!isCustomerFieldsOpen)}
                                className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                                title={isCustomerFieldsOpen ? "Minimizar" : "Maximizar"}
                                aria-label={isCustomerFieldsOpen ? "Minimizar" : "Maximizar"}
                            >
                                {isCustomerFieldsOpen ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </CardHeader>
                    {isCustomerFieldsOpen && (
                        <CardContent className="p-0 animate-in fade-in duration-200">
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
                    )}
                </Card>

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

            {/* MODAL MAXIMIZADO DE EDICIÓN DE POLÍTICAS Y TÉRMINOS GENERALES */}
            <Dialog
                open={expandedEditor.open}
                onOpenChange={(open) => !open && setExpandedEditor((prev) => ({ ...prev, open: false }))}
            >
                <DialogContent
                    hideCloseButton={true}
                    className="p-0 overflow-hidden max-w-3xl w-[95vw] max-h-[90vh] flex flex-col rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)]"
                >
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-800 shrink-0">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <FileText className="h-4 w-4 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-sm font-bold text-white tracking-tight">
                                        {expandedEditor.title}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        {expandedEditor.description}
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="hidden sm:flex items-center gap-1.5">
                                    {expandedEditor.maxLength ? (
                                        <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                                            {expandedText.length}/{expandedEditor.maxLength} caracteres
                                        </Badge>
                                    ) : (
                                        <>
                                            <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                                                {expandedText.trim().split(/\s+/).filter(Boolean).length} palabras
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                                                {expandedText.length} caracteres
                                            </Badge>
                                        </>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setExpandedEditor((prev) => ({ ...prev, open: false }))}
                                    className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 ml-2"
                                    aria-label="Cerrar modal"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 space-y-2 p-4 sm:p-5 overflow-y-auto">
                        <Textarea
                            value={expandedText}
                            maxLength={expandedEditor.maxLength}
                            onChange={(e) => setExpandedText(e.target.value)}
                            placeholder="Escribe aquí el texto..."
                            className="flex-1 min-h-[220px] sm:min-h-[300px] text-xs sm:text-sm font-sans leading-relaxed resize-none p-3.5 rounded-xl border-border/80 focus:border-blue-500"
                        />
                    </div>

                    <div className="p-3 sm:p-4 bg-muted/15 border-t border-border/50 flex items-center justify-between gap-3 shrink-0">
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                            Haz clic en &quot;Aplicar y Guardar Ahora&quot; para publicar directamente en el Sitio Web y la App.
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedEditor((prev) => ({ ...prev, open: false }))}
                                className="h-8 text-xs cursor-pointer"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                variant="alfa"
                                size="sm"
                                disabled={isSubmitting}
                                onClick={async () => {
                                    form.setValue(expandedEditor.field, expandedText, { shouldDirty: true });
                                    setExpandedEditor((prev) => ({ ...prev, open: false }));
                                    await onSubmit({
                                        ...form.getValues(),
                                        [expandedEditor.field]: expandedText,
                                    });
                                }}
                                className="h-8 text-xs font-semibold cursor-pointer"
                            >
                                Aplicar y Guardar Ahora
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function SitioWebPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <SitioWebContent />
        </Suspense>
    );
}
