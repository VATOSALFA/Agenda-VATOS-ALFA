'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, ChevronLeft, Image as ImageIcon, Video, Copy, Check } from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useAuth } from '@/contexts/firebase-auth-context';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function PromotionDetailView() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data: promotions, loading } = useFirestoreQuery<Promotion>('promociones');
    const [copied, setCopied] = useState(false);

    if (loading) {
        return <div className="p-8 flex justify-center"><CustomLoader /></div>;
    }

    const promo = promotions?.find(p => p.id === id);

    if (!promo) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
                <h3 className="text-xl font-semibold mb-2">Promoción no encontrada</h3>
                <p className="text-muted-foreground mb-6">Es posible que haya sido eliminada o ya no esté disponible.</p>
                <Button onClick={() => router.push('/promociones')}>
                    <ChevronLeft className="mr-2 h-4 w-4" /> Volver a Promociones
                </Button>
            </div>
        );
    }

    const isVideo = (url: string) => {
        return url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.webm') || url.toLowerCase().includes('alt=media&token=') && url.includes('video');
    };

    const copyToClipboard = () => {
        const text = `🎉 *${promo.name}*\n\n${promo.description}\n\n*Condiciones:*\n${promo.termsAndConditions || 'Aplican restricciones.'}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fmt = (d: any) => {
        if (!d) return '';
        if (typeof d === 'string') return d;
        if (d?.toDate) return format(d.toDate(), 'dd de MMMM de yyyy', { locale: es });
        if (d instanceof Date) return format(d, 'dd de MMMM de yyyy', { locale: es });
        return '';
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 max-w-5xl mx-auto">
            <Button variant="ghost" className="mb-2 -ml-4 text-muted-foreground hover:text-foreground" asChild>
                <Link href="/promociones">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Volver
                </Link>
            </Button>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                {/* Media Section */}
                <div className="rounded-xl overflow-hidden border bg-muted/20 flex flex-col items-center justify-center h-[400px] lg:h-[600px] shadow-sm relative">
                    {promo.imageUrl ? (
                        isVideo(promo.imageUrl) ? (
                            <div className="relative w-full h-full">
                                <video 
                                    src={promo.imageUrl} 
                                    className="w-full h-full object-cover"
                                    autoPlay 
                                    muted 
                                    loop 
                                    playsInline 
                                />
                                <div className="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-lg backdrop-blur-md flex items-center gap-2 text-xs font-medium">
                                    <Video className="w-4 h-4" /> Formato Dinámico
                                </div>
                            </div>
                        ) : (
                            <img src={promo.imageUrl} alt={promo.name} className="h-full w-full object-cover" />
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground/50">
                            <ImageIcon className="h-24 w-24 mb-4" />
                            <p>Sin contenido visual</p>
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <Badge className={promo.active ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-500 text-white'}>
                            {promo.active ? 'PROMO ACTIVA' : 'INACTIVA'}
                        </Badge>
                        <span className="text-sm font-medium text-muted-foreground flex items-center">
                            <Calendar className="w-4 h-4 mr-1.5" />
                            {fmt(promo.startDate)} - {fmt(promo.endDate)}
                        </span>
                    </div>

                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">{promo.name}</h1>

                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none mb-8">
                        <h3 className="text-lg font-semibold text-foreground mb-2 border-b pb-2">Descripción de la Oferta</h3>
                        <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                            {promo.description}
                        </p>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-5 mb-8 border">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center">
                            Términos y Condiciones
                        </h3>
                        <p className="whitespace-pre-wrap text-sm text-foreground/80 leading-relaxed">
                            {promo.termsAndConditions || 'No se especificaron términos y condiciones adicionales para esta promoción. Consultar con administración en caso de duda.'}
                        </p>
                    </div>

                    <div className="mt-auto pt-4 flex gap-4">
                        <Button 
                            onClick={copyToClipboard} 
                            className="w-full sm:w-auto flex-1"
                            variant={copied ? "default" : "outline"}
                        >
                            {copied ? (
                                <>
                                    <Check className="mr-2 h-4 w-4" /> ¡Copiado al portapapeles!
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-2 h-4 w-4" /> Copiar Resumen para WhatsApp
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
