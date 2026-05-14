'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Info, ArrowLeft, Share2, Sparkles, Calendar, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import BackgroundAurora from '@/components/ui/background-aurora';
import { VatosButton } from '@/components/ui/vatos-button';
import Link from 'next/link';

export default function PromotionTermsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { data: promotions, loading } = useFirestoreQuery<Promotion>('promociones');

    const promo = promotions?.find(p => p.id === id);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-8">
                <CustomLoader />
            </div>
        );
    }

    if (!promo) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-white text-center">
                <FileText className="w-16 h-16 text-primary mb-6 opacity-50" />
                <h1 className="text-3xl font-bold mb-4">Términos no encontrados</h1>
                <p className="text-white/60 mb-8 max-w-md">
                    Los términos y condiciones que buscas no existen o el enlace es incorrecto.
                </p>
                <VatosButton onClick={() => router.push('/')}>
                    Volver al inicio
                </VatosButton>
            </div>
        );
    }

    const shareTerms = () => {
        if (navigator.share) {
            navigator.share({
                title: `Términos y Condiciones - ${promo.name}`,
                text: `Términos y Condiciones de la dinámica: ${promo.name}`,
                url: window.location.href,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            toast({
                title: "Enlace copiado",
                description: "El link de los términos y condiciones se ha copiado al portapapeles.",
            });
        }
    };

    return (
        <div className="min-h-screen bg-black text-white selection:bg-primary/30 font-sans">
            <BackgroundAurora />
            
            {/* Header */}
            <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-bold text-lg">Vatos Alfa</span>
                </Link>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={shareTerms}
                        className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        title="Compartir términos"
                    >
                        <Share2 className="w-5 h-5" />
                    </button>
                    <VatosButton size="sm" onClick={() => router.push('/reservar')}>
                        ¡Reservar!
                    </VatosButton>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-6 md:p-12 relative z-10">
                <div className="bg-slate-900/50 backdrop-blur-xl rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
                    
                    {/* Hero Section of the Terms */}
                    <div className="bg-gradient-to-b from-primary/20 to-transparent p-8 md:p-12 text-center border-b border-white/5">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 text-primary mb-6 border border-primary/30 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                            <Info className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
                            Términos y Condiciones
                        </h1>
                        <h2 className="text-xl md:text-2xl text-primary font-semibold mb-6">
                            {promo.name}
                        </h2>
                        
                        <div className="flex justify-center items-center gap-2 text-white/60 text-sm font-medium">
                            <Calendar className="w-4 h-4" />
                            {(() => {
                                const fmt = (d: any) => {
                                    if (!d) return '';
                                    if (typeof d === 'string') return d;
                                    if (d?.toDate) return format(d.toDate(), 'dd MMMM yyyy', { locale: es });
                                    if (d instanceof Date) return format(d, 'dd MMMM yyyy', { locale: es });
                                    return '';
                                };
                                return `Vigencia: ${fmt(promo.startDate)} al ${fmt(promo.endDate)}`;
                            })()}
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="p-8 md:p-12">
                        <div className="prose prose-invert prose-blue max-w-none">
                            <div className="text-white/80 leading-relaxed whitespace-pre-line text-[15px] md:text-base space-y-4">
                                {promo.termsAndConditions || 'La participación en esta dinámica implica la aceptación total de los términos correspondientes.'}
                            </div>
                        </div>
                    </div>
                    
                    {/* Footer of the Terms */}
                    <div className="bg-white/5 p-8 text-center border-t border-white/5">
                        <p className="text-sm text-white/50 mb-6 max-w-lg mx-auto">
                            Al participar en esta promoción, confirmas que has leído y aceptas todos los términos y condiciones establecidos en este documento.
                        </p>
                        <VatosButton 
                            className="w-full sm:w-auto h-12 px-8 text-base shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                            onClick={() => router.push('/reservar')}
                        >
                            Entendido, ¡Quiero Reservar!
                        </VatosButton>
                    </div>
                </div>
            </main>
            
            {/* Minimal Footer */}
            <footer className="p-8 text-center text-white/20 text-xs uppercase tracking-widest font-bold">
                © {new Date().getFullYear()} Vatos Alfa. Todos los derechos reservados.
            </footer>
        </div>
    );
}
