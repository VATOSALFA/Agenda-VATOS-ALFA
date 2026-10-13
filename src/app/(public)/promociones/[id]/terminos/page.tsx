'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, FileText, ArrowLeft, Share2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import BackgroundAurora from '@/components/ui/background-aurora';
import Link from 'next/link';

export default function PromotionTermsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { data: promotions, loading } = useFirestoreQuery<Promotion>('promociones');

    const promo = promotions?.find(p => p.id === id);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
                <CustomLoader />
            </div>
        );
    }

    if (!promo) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white text-center relative overflow-hidden">
                <div className="w-full max-w-md bg-slate-900 border-2 border-blue-500 rounded-2xl p-8 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                    <img 
                        src="/logo-v-400x400.webp" 
                        alt="Vatos Alfa" 
                        className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-blue-500/40 object-cover shadow-lg"
                    />
                    <FileText className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                    <h1 className="text-2xl font-bold mb-2 text-white">Términos no encontrados</h1>
                    <p className="text-slate-400 mb-6 text-sm">
                        Los términos y condiciones que buscas no existen o el enlace es incorrecto.
                    </p>
                    <Button variant="alfa" className="w-full h-11 font-bold" onClick={() => router.push('/')}>
                        Volver al inicio
                    </Button>
                </div>
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
        <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-600/30 font-sans">
            <BackgroundAurora />
            
            {/* Header */}
            <header className="sticky top-0 z-50 bg-gradient-to-r from-[#10172b]/95 via-[#1c2847]/95 to-[#12192d]/95 backdrop-blur-xl border-b border-blue-500/20 px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg">
                <Link href={`/promociones/${promo.id}`} className="h-8 px-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors text-sm font-semibold">
                    <ArrowLeft className="w-4 h-4 text-slate-400" />
                    <span className="hidden sm:inline">Ver Promoción</span>
                </Link>

                <Link href="/" className="flex items-center gap-2">
                    <img 
                        src="/logo-v-400x400.webp" 
                        alt="Vatos Alfa" 
                        className="w-8 h-8 rounded-full border border-blue-500/40 object-cover shadow-sm"
                    />
                    <span className="font-extrabold tracking-tight text-white text-base hidden sm:inline">VATOS ALFA</span>
                </Link>
                
                <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                        onClick={shareTerms}
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                        title="Compartir términos"
                    >
                        <Share2 className="w-4 h-4" />
                    </button>
                    <Button 
                        variant="alfa" 
                        size="sm" 
                        className="h-8 px-4 text-xs font-bold shadow-md"
                        onClick={() => router.push('/reservar')}
                    >
                        ¡Reservar!
                    </Button>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-4 sm:p-6 md:p-12 relative z-10">
                <div className="bg-slate-900 border-2 border-blue-500 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                    
                    {/* Official Header */}
                    <div className="relative bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-6 sm:p-8 text-center border-b border-blue-500/20 overflow-hidden">
                        <div className="header-light-beam pointer-events-none" />
                        
                        <div className="relative z-10 flex flex-col items-center">
                            <FileText className="w-8 h-8 text-blue-400 mb-2" />
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1">
                                Términos y Condiciones
                            </h1>
                            <h2 className="text-base sm:text-lg text-blue-400 font-semibold mb-3">
                                {promo.name}
                            </h2>
                            
                            <div className="flex justify-center items-center gap-2 text-slate-300 text-xs sm:text-sm font-medium">
                                <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
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
                    </div>

                    {/* Content Section */}
                    <div className="p-6 sm:p-8 space-y-4">
                        <div className="text-slate-300 leading-relaxed whitespace-pre-line text-sm sm:text-base space-y-3">
                            {promo.termsAndConditions || 'La participación en esta dinámica implica la aceptación total de los términos y condiciones correspondientes.'}
                        </div>
                    </div>
                    
                    {/* Footer of the Terms */}
                    <div className="bg-slate-950/60 p-6 sm:p-8 text-center border-t border-slate-800 space-y-4">
                        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                            Al hacer válida esta promoción, confirmas haber leído y aceptado las políticas y condiciones aquí descritas.
                        </p>
                        <div className="pt-2 flex justify-center">
                            <Button 
                                variant="alfa"
                                className="w-full sm:w-auto h-11 px-8 text-sm font-bold shadow-lg"
                                onClick={() => router.push('/reservar')}
                            >
                                Entendido, ¡Quiero Reservar!
                            </Button>
                        </div>
                    </div>
                </div>
            </main>
            
            {/* Minimal Footer */}
            <footer className="p-8 text-center text-slate-400 text-xs uppercase tracking-widest font-semibold">
                © {new Date().getFullYear()} Vatos Alfa Barber Shop. Todos los derechos reservados.
            </footer>
        </div>
    );
}
