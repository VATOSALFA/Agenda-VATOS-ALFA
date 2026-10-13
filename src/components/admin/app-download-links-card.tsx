'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Loader2,
    Smartphone,
    Save,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    HelpCircle,
    CheckCircle2,
    Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function InfoTooltip({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen((prev) => !prev);
                    }}
                    className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-primary transition-colors p-0.5 rounded-full focus:outline-none shrink-0"
                    aria-label="Más información"
                >
                    <HelpCircle className="w-3.5 h-3.5 cursor-pointer" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="center"
                className="max-w-xs text-xs p-2.5 bg-slate-900 text-slate-100 border border-slate-800 shadow-xl rounded-xl z-50 pointer-events-none"
            >
                <p className="leading-relaxed">{text}</p>
            </PopoverContent>
        </Popover>
    );
}

export function AppDownloadLinksCard({ className }: { className?: string }) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form fields
    const [playStoreUrl, setPlayStoreUrl] = useState('');
    const [appStoreUrl, setAppStoreUrl] = useState('');
    const [showDownloadButton, setShowDownloadButton] = useState(true);

    // Cargar configuración de Firestore
    useEffect(() => {
        let isMounted = true;
        async function fetchAppLinks() {
            setIsLoading(true);
            try {
                // 1. Intentar de configuracion/app_movil
                const appMovilRef = doc(db, 'configuracion', 'app_movil');
                const appMovilSnap = await getDoc(appMovilRef);

                let data: any = {};
                if (appMovilSnap.exists()) {
                    data = appMovilSnap.data() || {};
                }

                // 2. Si faltan campos, intentar de settings/website
                if (!data.playStoreUrl && !data.appStoreUrl) {
                    const websiteRef = doc(db, 'settings', 'website');
                    const websiteSnap = await getDoc(websiteRef);
                    if (websiteSnap.exists()) {
                        const webData = websiteSnap.data() || {};
                        data.playStoreUrl = webData.playStoreUrl || '';
                        data.appStoreUrl = webData.appStoreUrl || '';
                        if (webData.showAppDownload !== undefined) {
                            data.showDownloadButton = webData.showAppDownload;
                        }
                    }
                }

                if (isMounted) {
                    setPlayStoreUrl(data.playStoreUrl || '');
                    setAppStoreUrl(data.appStoreUrl || '');
                    setShowDownloadButton(data.showDownloadButton !== false);
                }
            } catch (err) {
                console.warn('Error al cargar enlaces de la app móvil:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        }

        fetchAppLinks();
        return () => {
            isMounted = false;
        };
    }, []);

    const hasAnyLink = Boolean(playStoreUrl.trim() || appStoreUrl.trim());

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const cleanPlayStore = playStoreUrl.trim();
            const cleanAppStore = appStoreUrl.trim();

            const payload = {
                playStoreUrl: cleanPlayStore,
                appStoreUrl: cleanAppStore,
                showDownloadButton,
                showAppDownload: showDownloadButton,
                actualizado_el: Timestamp.now(),
            };

            // Guardar en ambas colecciones para sincronización en tiempo real
            await Promise.all([
                setDoc(doc(db, 'configuracion', 'app_movil'), payload, { merge: true }),
                setDoc(doc(db, 'settings', 'website'), {
                    playStoreUrl: cleanPlayStore,
                    appStoreUrl: cleanAppStore,
                    showAppDownload: showDownloadButton,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            toast({
                title: 'Enlaces Guardados con Éxito',
                description: 'La configuración de descarga de la app móvil ha sido actualizada para la web y la app.',
            });
        } catch (err: any) {
            console.error('Error al guardar enlaces de app:', err);
            toast({
                title: 'Error al Guardar',
                description: err?.message || 'No se pudieron guardar los enlaces de la app.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card className={cn("border border-border/70 shadow-xs transition-all", className)}>
            <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <Smartphone className="h-4 w-4 text-slate-400 shrink-0" />
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Enlaces de Descarga (Play Store & App Store)
                            </CardTitle>
                            <InfoTooltip text="Configura los enlaces directos a las tiendas oficiales. Se reflejarán inmediatamente en el botón de descarga del sitio web." />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                        {hasAnyLink ? (
                            <Badge variant="secondary" className="bg-[#202A49]/10 text-[#202A49] dark:bg-white/10 dark:text-slate-200 border border-[#202A49]/20 text-xs py-0.5 px-2 font-medium">
                                Tiendas Activas
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-muted-foreground text-xs py-0.5 px-2 font-normal">
                                Próximamente
                            </Badge>
                        )}

                        <div className="h-4 w-px bg-border/60 hidden sm:block" />

                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="toggle-download-btn" className="text-xs text-muted-foreground hidden sm:inline cursor-pointer">
                                {showDownloadButton ? 'Botón Visible' : 'Botón Oculto'}
                            </Label>
                            <Switch
                                id="toggle-download-btn"
                                checked={showDownloadButton}
                                onCheckedChange={setShowDownloadButton}
                                title={showDownloadButton ? "Botón visible en la web" : "Botón oculto en la web"}
                                aria-label="Mostrar botón de descarga en la web"
                                className="scale-90"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsOpen(!isOpen)}
                            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                            title={isOpen ? "Minimizar" : "Desplegar"}
                            aria-label={isOpen ? "Minimizar" : "Desplegar"}
                        >
                            {isOpen ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>
            </CardHeader>

            {isOpen && (
                isLoading ? (
                    <CardContent className="py-8 flex justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </CardContent>
                ) : (
                    <CardContent className="space-y-4 pt-3.5 px-3.5 sm:px-5 pb-5">
                        {/* Estado y explicación */}
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                            <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-semibold text-foreground">
                                    {hasAnyLink
                                        ? '¡Tus enlaces a las tiendas están conectados!'
                                        : 'Modo Anuncio / Próximamente activo'}
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    {hasAnyLink
                                        ? 'Los clientes que pulsen "Descargar App" desde un dispositivo móvil serán redirigidos automáticamente a la tienda oficial correspondiente.'
                                        : 'El botón de descarga ya está presente en el sitio web. Si un cliente lo pulsa, se le mostrará un aviso oficial elegante indicando que la aplicación estará disponible muy pronto. En cuanto coloques los enlaces aquí, comenzará a redirigir a las tiendas de inmediato.'}
                                </p>
                            </div>
                        </div>

                        {/* Campos de Enlaces */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 1. Google Play Store */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                        <span>Google Play Store (Android)</span>
                                    </Label>
                                    {playStoreUrl.trim() && (
                                        <a
                                            href={playStoreUrl.trim()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-blue-500 hover:underline flex items-center gap-1"
                                        >
                                            <span>Probar link</span>
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                                <Input
                                    value={playStoreUrl}
                                    onChange={(e) => setPlayStoreUrl(e.target.value)}
                                    placeholder="https://play.google.com/store/apps/details?id=com.vatosalfa.app"
                                    className="text-xs h-9"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Pega la URL pública de la ficha de la app en Google Play Store.
                                </p>
                            </div>

                            {/* 2. Apple App Store */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                        <span>Apple App Store (iPhone / iPad)</span>
                                    </Label>
                                    {appStoreUrl.trim() && (
                                        <a
                                            href={appStoreUrl.trim()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-blue-500 hover:underline flex items-center gap-1"
                                        >
                                            <span>Probar link</span>
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                                <Input
                                    value={appStoreUrl}
                                    onChange={(e) => setAppStoreUrl(e.target.value)}
                                    placeholder="https://apps.apple.com/app/vatos-alfa/id1234567890"
                                    className="text-xs h-9"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Pega la URL pública de la ficha de la app en Apple App Store.
                                </p>
                            </div>
                        </div>

                        {/* Botón de Guardar */}
                        <div className="pt-2 flex justify-end">
                            <Button
                                type="button"
                                variant="alfa"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="h-9 px-4 text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Guardando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-3.5 h-3.5 text-white" />
                                        <span>Guardar Enlaces de la App</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                )
            )}
        </Card>
    );
}
