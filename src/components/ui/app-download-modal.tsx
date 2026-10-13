'use client';

import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Smartphone,
    X,
    Sparkles,
    Calendar,
    Award,
    CheckCircle2,
    ExternalLink,
    Clock,
} from 'lucide-react';

interface AppDownloadModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    playStoreUrl?: string;
    appStoreUrl?: string;
}

export function AppDownloadModal({
    isOpen,
    onOpenChange,
    playStoreUrl = '',
    appStoreUrl = '',
}: AppDownloadModalProps) {
    const hasPlayStore = Boolean(playStoreUrl?.trim());
    const hasAppStore = Boolean(appStoreUrl?.trim());

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                hideCloseButton={true}
                className="w-[calc(100%-2rem)] sm:w-full max-w-lg p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background z-50"
            >
                {/* Cabecera Oficial VATOS ALFA con Franja Azul y Haz de Luz Oblicuo */}
                <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-5 py-4 text-white shrink-0">
                    <div className="header-light-beam" aria-hidden="true" />
                    <div className="relative z-10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Smartphone className="w-5 h-5 text-slate-300 shrink-0" />
                            <div>
                                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                                    App Móvil VATOS ALFA
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300 mt-0.5 leading-normal">
                                    Disponible para Android e iOS • Pase Alfa y Citas
                                </DialogDescription>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                            aria-label="Cerrar modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Contenido del Modal */}
                <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {/* Beneficios de la App */}
                    <div className="rounded-xl bg-muted/30 border border-border/60 p-3.5 space-y-2.5">
                        <span className="text-[11px] font-bold text-[#C5A880] uppercase tracking-wider block">
                            ¿Por qué descargar la app oficial?
                        </span>
                        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                            <div className="flex items-start gap-2">
                                <Award className="w-4 h-4 text-[#C5A880] shrink-0 mt-0.5" />
                                <span><strong className="text-foreground font-semibold">Pase Alfa Digital:</strong> Acumula sellos por tus cortes y obtén tu 10.ª visita totalmente gratis.</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <Calendar className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                <span><strong className="text-foreground font-semibold">Citas en 1 Clic:</strong> Agenda, consulta y gestiona tus horarios con tus barberos favoritos en segundos.</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <Sparkles className="w-4 h-4 text-[#C5A880] shrink-0 mt-0.5" />
                                <span><strong className="text-foreground font-semibold">Beneficios Exclusivos:</strong> Regalos de cumpleaños, dinámicas VIP y notificaciones en tiempo real.</span>
                            </div>
                        </div>
                    </div>

                    {/* Tiendas de Aplicaciones */}
                    <div className="space-y-3 pt-1">
                        {/* 1. Google Play Store (Android) */}
                        <div className="rounded-xl border border-border/70 p-3.5 bg-card space-y-2 transition-all">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {/* Icono oficial Google Play / Android bare */}
                                    <svg className="w-5 h-5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3.609 1.814L13.792 12 3.61 22.186c-.198-.198-.31-.469-.31-.76V2.574c0-.291.112-.562.31-.76zm11.246 11.247l2.257 2.257-11.83 6.83 9.573-9.087zm0-2.122L5.282 1.852l11.83 6.83-2.257 2.257zm1.485 1.061l3.528 2.037c.703.406.703 1.068 0 1.474l-3.528 2.037-2.33-2.33 2.33-2.218z"/>
                                    </svg>
                                    <div>
                                        <h4 className="text-xs font-bold text-foreground">Google Play Store</h4>
                                        <p className="text-[10px] text-muted-foreground">Dispositivos Android</p>
                                    </div>
                                </div>

                                {hasPlayStore ? (
                                    <Badge variant="secondary" className="text-[10px] py-0.5 px-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                                        Disponible
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] py-0.5 px-2 text-muted-foreground border-border/60 font-sans">
                                        Próximamente
                                    </Badge>
                                )}
                            </div>

                            {hasPlayStore ? (
                                <a
                                    href={playStoreUrl.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full"
                                >
                                    <Button
                                        type="button"
                                        variant="alfa"
                                        className="w-full h-10 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer"
                                    >
                                        <span>Descargar en Google Play</span>
                                        <ExternalLink className="w-3.5 h-3.5 text-white" />
                                    </Button>
                                </a>
                            ) : (
                                <div className="text-[11px] text-slate-500 bg-muted/20 rounded-lg p-2 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>Estamos en el proceso de publicación oficial. ¡Muy pronto podrás descargarla!</span>
                                </div>
                            )}
                        </div>

                        {/* 2. Apple App Store (iOS) */}
                        <div className="rounded-xl border border-border/70 p-3.5 bg-card space-y-2 transition-all">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {/* Icono oficial Apple bare */}
                                    <svg className="w-5 h-5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.62-.75 1.04-1.8 0.93-2.84-.9.04-2 .6-2.65 1.36-.57.65-.98 1.72-.85 2.73 1.01.08 2.05-.5 2.57-1.25z"/>
                                    </svg>
                                    <div>
                                        <h4 className="text-xs font-bold text-foreground">Apple App Store</h4>
                                        <p className="text-[10px] text-muted-foreground">iPhone / iPad (iOS)</p>
                                    </div>
                                </div>

                                {hasAppStore ? (
                                    <Badge variant="secondary" className="text-[10px] py-0.5 px-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                                        Disponible
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] py-0.5 px-2 text-muted-foreground border-border/60 font-sans">
                                        Próximamente
                                    </Badge>
                                )}
                            </div>

                            {hasAppStore ? (
                                <a
                                    href={appStoreUrl.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full"
                                >
                                    <Button
                                        type="button"
                                        variant="alfa"
                                        className="w-full h-10 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer"
                                    >
                                        <span>Descargar en App Store</span>
                                        <ExternalLink className="w-3.5 h-3.5 text-white" />
                                    </Button>
                                </a>
                            ) : (
                                <div className="text-[11px] text-slate-500 bg-muted/20 rounded-lg p-2 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>Estamos en el proceso de revisión con Apple. ¡Muy pronto podrás descargarla!</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-2 text-center">
                        <p className="text-[11px] text-muted-foreground">
                            Mientras tanto, puedes agendar tus citas cómodamente desde esta página web.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
