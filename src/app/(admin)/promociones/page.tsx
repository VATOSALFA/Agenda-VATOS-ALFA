'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Eye, Image as ImageIcon, Video } from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { useAuth } from '@/contexts/firebase-auth-context';
import Link from 'next/link';

export default function PromocionesListView() {
    const { user } = useAuth();
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activePromotions.map((promo) => (
                        <Card key={promo.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                            <div className="relative h-56 w-full bg-black/5 border-b">
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
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                    {promo.description}
                                </p>
                            </CardContent>
                            <CardFooter className="pt-0 pb-4 px-6 border-t mt-auto pt-4">
                                <Button asChild className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors" variant="ghost">
                                    <Link href={`/promociones/view/${promo.id}`}>
                                        <Eye className="w-4 h-4 mr-2" />
                                        Ver detalles y T&C
                                    </Link>
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
