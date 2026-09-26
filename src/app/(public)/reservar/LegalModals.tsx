import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { VatosButton } from '@/components/ui/vatos-button';

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
            <Dialog open={privacyModalOpen} onOpenChange={setPrivacyModalOpen}>
                <DialogContent className="max-w-md bg-white p-6 rounded-xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Aviso de Privacidad</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto mt-4 pr-2">
                        <div className="text-sm text-slate-700 whitespace-pre-line">
                            {websiteSettings.privacyText || 'Sin contenido de privacidad.'}
                        </div>
                    </div>
                    <DialogFooter className="mt-4">
                        <VatosButton onClick={() => setPrivacyModalOpen(false)}>Cerrar</VatosButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
                <DialogContent className="max-w-md bg-white p-6 rounded-xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Términos y Condiciones</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto mt-4 pr-2">
                        <div className="text-sm text-slate-700 whitespace-pre-line">
                            {websiteSettings.termsText || 'Sin términos y condiciones definidos.'}
                        </div>
                    </div>
                    <DialogFooter className="mt-4">
                        <VatosButton onClick={() => setTermsModalOpen(false)}>Cerrar</VatosButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
