'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Eye, Image as ImageIcon, Video, Info, X, Share2 } from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

export default function PromocionesListView() {
    const { user } = useAuth();
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [showTerms, setShowTerms] = useState<Promotion | null>(null);
    // Only fetch active promotions for the staff
    const { data: promotions, loading } = useFirestoreQuery<Promotion>('promociones');

    if (loading) {
        return <div className="p-8 flex justify-center"><CustomLoader /></div>;
    }

    const activePromotions = promotions?.filter(p => p.active) || [];

    const isVideo = (url: string) => {
        return url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.webm') || url.toLowerCase().includes('alt=media&token=') && url.includes('video');
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Promociones Activas</h2>
                    <p className="text-muted-foreground mt-2">
                        Consulta aquí las ofertas y promociones vigentes para informar a los clientes.
                    </p>
                </div>
            </div>

            {activePromotions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-muted/20">
                    <div className="bg-muted p-4 rounded-full mb-4">
                        <ImageIcon className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold">No hay promociones activas</h3>
                    <p className="text-muted-foreground max-w-sm mt-2">
                        Actualmente no hay ninguna promoción configurada. Cuando se active una, aparecerá aquí automáticamente.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {activePromotions.map((promo) => (
                        <Card key={promo.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                            <div className="relative aspect-square w-full bg-black/5 border-b overflow-hidden cursor-pointer group" onClick={() => setSelectedPromotion(promo)}>
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
                                            <div className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-md backdrop-blur-sm">
                                                <Video className="w-4 h-4" />
                                            </div>
                                        </div>
                                    ) : (
                                        <img src={promo.imageUrl} alt={promo.name} className="h-full w-full object-cover" />
                                    )
                                ) : (
                                    <div className="flex h-full items-center justify-center text-muted-foreground">
                                        <ImageIcon className="h-12 w-12 opacity-20" />
                                    </div>
                                )}
                                <Badge className="absolute bottom-3 left-3 bg-primary text-primary-foreground">
                                    Activa
                                </Badge>
                            </div>
                            <CardHeader className="pb-3">
                                <CardTitle className="line-clamp-2 text-xl leading-tight">{promo.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1.5 text-xs font-medium pt-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {(() => {
                                        const fmt = (d: any) => {
                                            if (!d) return '';
                                            if (typeof d === 'string') return d;
                                            if (d?.toDate) return format(d.toDate(), 'dd/MMM/yyyy', { locale: es });
                                            if (d instanceof Date) return format(d, 'dd/MMM/yyyy', { locale: es });
                                            return '';
                                        };
                                        return `Válida: ${fmt(promo.startDate)} al ${fmt(promo.endDate)}`;
                                    })()}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="text-sm text-muted-foreground h-28 overflow-y-auto mb-4 pr-1 custom-scrollbar whitespace-pre-line">
                                    {promo.description}
                                </div>
                                {promo.termsAndConditions && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowTerms(promo);
                                        }}
                                        className="text-xs font-medium text-primary hover:underline transition-colors"
                                    >
                                        Términos y condiciones
                                    </button>
                                )}
                            </CardContent>
                            <CardFooter className="pt-0 pb-4 px-6 border-t mt-auto pt-4 flex gap-2">
                                <Button className="flex-1 bg-primary text-primary-foreground border-none font-bold" onClick={() => setSelectedPromotion(promo)}>
                                    {promo.imageUrl && isVideo(promo.imageUrl) ? (
                                        <>
                                            <Video className="w-4 h-4 mr-2" />
                                            Ver Reel
                                        </>
                                    ) : (
                                        <>
                                            <ImageIcon className="w-4 h-4 mr-2" />
                                            Ver Imagen
                                        </>
                                    )}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="shrink-0" 
                                    title="Copiar link público"
                                    onClick={() => {
                                        const url = `${window.location.origin}/promociones/${promo.id}`;
                                        navigator.clipboard.writeText(url);
                                        toast({
                                            title: "Link copiado",
                                            description: "Enlace público listo para compartir.",
                                        });
                                    }}
                                >
                                    <Share2 className="w-4 h-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}

            {/* Promotion Reel Modal - CLEAN VIDEO ONLY */}
            <Dialog open={!!selectedPromotion} onOpenChange={(open) => !open && setSelectedPromotion(null)}>
                <DialogContent className="max-w-none w-full h-[100dvh] sm:w-[400px] sm:h-[800px] sm:max-h-[90vh] bg-black p-0 rounded-none sm:rounded-[2rem] overflow-hidden border-none sm:border sm:border-white/20 shadow-2xl flex flex-col">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{selectedPromotion?.name || 'Ver Promoción'}</DialogTitle>
                        <DialogDescription>{selectedPromotion?.description || 'Detalle de la promoción'}</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 w-full h-full bg-black relative flex items-center justify-center">
                        {selectedPromotion?.imageUrl ? (
                            isVideo(selectedPromotion.imageUrl) ? (
                                <video
                                    src={selectedPromotion.imageUrl}
                                    className="w-full h-full object-contain"
                                    autoPlay
                                    controls
                                    playsInline
                                    loop
                                />
                            ) : (
                                <img
                                    src={selectedPromotion.imageUrl}
                                    alt={selectedPromotion?.name}
                                    className="w-full h-full object-contain"
                                />
                            )
                        ) : (
                            <div className="text-white/50 text-center p-8">
                                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p>Sin contenido visual</p>
                            </div>
                        )}
                        
                        {/* No buttons or info overlay as per user request */}
                    </div>
                    
                    <button 
                        onClick={() => setSelectedPromotion(null)}
                        className="absolute top-4 right-4 bg-black/40 backdrop-blur-lg border border-white/20 text-white p-2.5 rounded-full hover:bg-white/20 transition-colors z-50 shadow-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </DialogContent>
            </Dialog>

            {/* Terms and Conditions Modal */}
            <Dialog open={!!showTerms} onOpenChange={(open) => !open && setShowTerms(null)}>
                <DialogContent className="max-w-md bg-white p-6 rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Info className="w-5 h-5 text-primary" /> Términos y Condiciones
                        </DialogTitle>
                        <DialogDescription>
                            {showTerms?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                        {showTerms?.termsAndConditions}
                    </div>
                    <div className="mt-6">
                        <Button className="w-full" onClick={() => setShowTerms(null)}>
                            Entendido
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
