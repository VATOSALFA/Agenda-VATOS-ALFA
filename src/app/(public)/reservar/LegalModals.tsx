import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShieldCheck, FileText, X } from 'lucide-react';

export function LegalModals({
    privacyModalOpen,
    setPrivacyModalOpen,
    termsModalOpen,
    setTermsModalOpen,
    websiteSettings
}: {
    privacyModalOpen: boolean;
    setPrivacyModalOpen: (open: boolean) => void;
    termsModalOpen: boolean;
    setTermsModalOpen: (open: boolean) => void;
    websiteSettings: any;
}) {
    return (
        <>
            {/* Modal: Aviso de Privacidad */}
            <Dialog open={privacyModalOpen} onOpenChange={setPrivacyModalOpen}>
                <DialogContent hideCloseButton={true} className="max-w-md sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background max-h-[85vh] flex flex-col">
                    {/* Cabecera Oficial Vatos Alfa */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-[#2d3a60]/60 shrink-0">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="h-5 w-5 text-[#C5A880] shrink-0" />
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Aviso de Privacidad Integral</h3>
                                    <p className="text-xs text-slate-300">Protección y tratamiento de datos personales</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setPrivacyModalOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                                aria-label="Cerrar modal"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Contenido con scrollbar estilizado */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-foreground/90 leading-relaxed text-xs sm:text-sm whitespace-pre-line">
                        {websiteSettings.privacyText || 'Sin contenido de privacidad.'}
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-5 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between gap-3 shrink-0">
                        <a
                            href="/privacidad"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 font-semibold"
                        >
                            Ver en página completa <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <Button 
                            variant="alfa" 
                            size="sm"
                            className="font-bold text-xs px-5 rounded-xl cursor-pointer"
                            onClick={() => setPrivacyModalOpen(false)}
                        >
                            Entendido
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal: Términos y Condiciones */}
            <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
                <DialogContent hideCloseButton={true} className="max-w-md sm:max-w-2xl lg:max-w-3xl p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background max-h-[85vh] flex flex-col">
                    {/* Cabecera Oficial Vatos Alfa */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-[#2d3a60]/60 shrink-0">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Términos y Condiciones</h3>
                                    <p className="text-xs text-slate-300">Normas y políticas de servicio</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setTermsModalOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                                aria-label="Cerrar modal"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Contenido con scrollbar estilizado */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-foreground/90 leading-relaxed text-xs sm:text-sm whitespace-pre-line">
                        {websiteSettings.termsText || 'Sin términos y condiciones definidos.'}
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-5 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between gap-3 shrink-0">
                        <a
                            href="/terminos"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1 font-semibold"
                        >
                            Ver en página completa <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <Button 
                            variant="alfa" 
                            size="sm"
                            className="font-bold text-xs px-5 rounded-xl cursor-pointer"
                            onClick={() => setTermsModalOpen(false)}
                        >
                            Aceptar y Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
