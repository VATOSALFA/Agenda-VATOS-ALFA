'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Info, ArrowLeft, Share2, Video, Image as ImageIcon, Sparkles, Scissors } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import BackgroundAurora from '@/components/ui/background-aurora';
import { VatosButton } from '@/components/ui/vatos-button';
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
            <div className="min-h-screen bg-black flex items-center justify-center p-8">
                <CustomLoader />
            </div>
        );
    }

    if (!promo || !promo.active) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-white text-center">
                <Sparkles className="w-16 h-16 text-primary mb-6 opacity-50" />
                <h1 className="text-3xl font-bold mb-4">Promoción no encontrada</h1>
                <p className="text-white/60 mb-8 max-w-md">
                    Esta promoción ya no está disponible o el enlace es incorrecto.
                </p>
                <VatosButton onClick={() => router.push('/')}>
                    Volver al inicio
                </VatosButton>
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
        <div className="min-h-screen bg-black text-white selection:bg-primary/30">
            <BackgroundAurora />
            
            {/* Header / Navigation */}
            <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <button 
                    onClick={() => {
                        if (window.history.length > 2) {
                            router.back();
                        } else {
                            router.push('/');
                        }
                    }} 
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity text-white"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-bold text-lg hidden sm:inline">Volver</span>
                </button>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={sharePromotion}
                        className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        title="Compartir promoción"
                    >
                        <Share2 className="w-5 h-5" />
                    </button>
                    <VatosButton size="sm" onClick={() => router.push('/reservar')}>
                        ¡Reservar!
                    </VatosButton>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-6 md:p-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start">
                    
                    {/* Content Section - 9:16 Video / Image */}
                    <div className="lg:col-span-5 flex justify-center">
                        <div className="relative w-full max-w-[320px] aspect-[9/16] bg-slate-900 rounded-[2rem] overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(59,130,246,0.2)] ring-8 ring-white/5">
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
                                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white/30">
                                    <ImageIcon className="w-16 h-16 mb-4" />
                                    <p>Sin imagen</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Details Section */}
                    <div className="lg:col-span-7 space-y-8 py-4">
                        <div>
                            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 border border-primary/30">
                                <Sparkles className="w-3 h-3" /> Promoción Especial
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
                                {promo.name}
                            </h1>
                            <div className="flex items-center gap-3 text-white/60 font-medium mb-8">
                                <Calendar className="w-5 h-5 text-primary" />
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
                            </div>
                            <p className="text-lg md:text-xl text-white/80 leading-relaxed font-medium">
                                {promo.description}
                            </p>
                        </div>

                        {/* Terms and Conditions Section */}
                        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                                <Info className="w-5 h-5 text-primary" /> Términos y Condiciones
                            </h2>
                            <div className="text-white/60 text-sm leading-relaxed whitespace-pre-line space-y-2">
                                {promo.termsAndConditions || 'No hay términos específicos para esta promoción.'}
                            </div>
                        </div>

                        {/* Conversion Section */}
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <VatosButton 
                                className="flex-1 h-14 text-lg font-bold shadow-[0_0_30px_rgba(59,130,246,0.3)]"
                                onClick={() => router.push('/reservar')}
                            >
                                ¡Aprovechar ahora!
                            </VatosButton>
                            <Button 
                                variant="outline" 
                                className="h-14 px-8 border-white/20 hover:bg-white/10 text-white font-bold"
                                onClick={sharePromotion}
                            >
                                <Share2 className="w-5 h-5 mr-2" /> Compartir
                            </Button>
                        </div>
                        
                        <div className="pt-8 border-t border-white/10 flex items-center gap-4 text-white/40">
                            <Scissors className="w-5 h-5" />
                            <p className="text-xs uppercase tracking-widest font-bold">Vatos Alfa Barber Shop • Premium Experience</p>
                        </div>
                    </div>
                </div>
            </main>
            
            {/* Minimal Footer */}
            <footer className="p-12 text-center text-white/20 text-xs uppercase tracking-widest font-bold">
                © {new Date().getFullYear()} Vatos Alfa. Todos los derechos reservados.
            </footer>
        </div>
    );
}
