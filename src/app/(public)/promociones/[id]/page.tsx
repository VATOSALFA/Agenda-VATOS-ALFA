'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Info, ArrowLeft, Share2, Image as ImageIcon, Sparkles, Scissors } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import BackgroundAurora from '@/components/ui/background-aurora';
import Link from 'next/link';

export default function PublicPromotionPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { data: promotions, loading } = useFirestoreQuery<Promotion>('promociones');

    const promo = promotions?.find(p => p.id === id);

    const isVideo = (url?: string) => {
        if (!url) return false;
        return url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.webm') || (url.toLowerCase().includes('alt=media') && url.includes('video'));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
                <CustomLoader />
            </div>
        );
    }

    if (!promo || !promo.active) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white text-center relative overflow-hidden">
                <div className="w-full max-w-md bg-slate-900 border-2 border-blue-500 rounded-2xl p-8 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                    <img 
                        src="/logo-v-400x400.webp" 
                        alt="Vatos Alfa" 
                        className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-blue-500/40 object-cover shadow-lg"
                    />
                    <h1 className="text-2xl font-bold mb-2 text-white">Promoción no disponible</h1>
                    <p className="text-slate-400 mb-6 text-sm">
                        Esta promoción ya no está disponible o el enlace ingresado es incorrecto.
                    </p>
                    <Button variant="alfa" className="w-full h-11 font-bold" onClick={() => router.push('/')}>
                        Volver al inicio
                    </Button>
                </div>
            </div>
        );
    }

    const sharePromotion = () => {
        if (navigator.share) {
            navigator.share({
                title: `Vatos Alfa - ${promo.name}`,
                text: promo.description,
                url: window.location.href,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            toast({
                title: "Enlace copiado",
                description: "El link de la promoción se ha copiado al portapapeles.",
            });
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-600/30">
            <BackgroundAurora />
            
            {/* Header / Navigation */}
            <header className="sticky top-0 z-50 bg-gradient-to-r from-[#10172b]/95 via-[#1c2847]/95 to-[#12192d]/95 backdrop-blur-xl border-b border-blue-500/20 px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg">
                <button 
                    onClick={() => {
                        if (window.history.length > 2) {
                            router.back();
                        } else {
                            router.push('/');
                        }
                    }} 
                    className="h-8 px-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors text-sm font-semibold"
                >
                    <ArrowLeft className="w-4 h-4 text-slate-400" />
                    <span className="hidden sm:inline">Volver</span>
                </button>

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
                        onClick={sharePromotion}
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                        title="Compartir promoción"
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

            <main className="max-w-4xl mx-auto p-4 sm:p-6 md:p-12 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                    
                    {/* Content Section - 9:16 Video / Image */}
                    <div className="lg:col-span-5 flex justify-center">
                        <div className="relative w-full max-w-[320px] aspect-[9/16] bg-slate-900 rounded-[2rem] overflow-hidden border-2 border-blue-500/50 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                            {promo.imageUrl ? (
                                isVideo(promo.imageUrl) ? (
                                    <video
                                        src={promo.imageUrl}
                                        className="w-full h-full object-cover"
                                        autoPlay
                                        controls
                                        playsInline
                                        loop
                                    />
                                ) : (
                                    <img
                                        src={promo.imageUrl}
                                        alt={promo.name}
                                        className="w-full h-full object-cover"
                                    />
                                )
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-500">
                                    <ImageIcon className="w-16 h-16 mb-4 text-slate-600" />
                                    <p className="text-sm">Sin imagen</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className="lg:col-span-7 space-y-6 py-2">
                        <div>
                            <div className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-blue-500/20">
                                <Sparkles className="w-3.5 h-3.5" /> Promoción Especial
                            </div>
                            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-4 tracking-tight text-white">
                                {promo.name}
                            </h1>
                            <div className="flex items-center gap-2 text-slate-300 font-medium mb-6 text-sm">
                                <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
                                <span>
                                    {(() => {
                                        const fmt = (d: any) => {
                                            if (!d) return '';
                                            if (typeof d === 'string') return d;
                                            if (d?.toDate) return format(d.toDate(), 'dd MMMM yyyy', { locale: es });
                                            if (d instanceof Date) return format(d, 'dd MMMM yyyy', { locale: es });
                                            return '';
                                        };
                                        return `Válida del ${fmt(promo.startDate)} al ${fmt(promo.endDate)}`;
                                    })()}
                                </span>
                            </div>
                            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
                                {promo.description}
                            </p>
                        </div>

                        {/* Terms and Conditions Section */}
                        <div className="bg-slate-900/70 backdrop-blur-md rounded-2xl p-6 border-2 border-blue-500/30">
                            <h2 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2 text-white">
                                <Info className="w-4 h-4 text-blue-400" /> Términos y Condiciones
                            </h2>
                            <div className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line space-y-2">
                                {promo.termsAndConditions || 'No hay términos específicos para esta promoción.'}
                            </div>
                        </div>

                        {/* Conversion Section */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <Button 
                                variant="alfa"
                                className="flex-1 h-12 text-base font-bold shadow-xl"
                                onClick={() => router.push('/reservar')}
                            >
                                ¡Aprovechar ahora!
                            </Button>
                            <Button 
                                variant="outline" 
                                className="h-12 px-6 border-slate-700 bg-slate-800/40 hover:bg-slate-800 hover:text-white text-slate-200 font-semibold"
                                onClick={sharePromotion}
                            >
                                <Share2 className="w-4 h-4 mr-2 text-slate-400" /> Compartir
                            </Button>
                        </div>
                        
                        <div className="pt-6 border-t border-slate-800 flex items-center gap-3 text-slate-400">
                            <Scissors className="w-4 h-4 text-blue-400" />
                            <p className="text-xs uppercase tracking-widest font-bold">Vatos Alfa Barber Shop • Experiencia Premium</p>
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
