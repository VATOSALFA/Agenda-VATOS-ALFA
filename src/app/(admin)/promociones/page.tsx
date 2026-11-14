'use client';

import React, { useState } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Promotion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar,
  Image as ImageIcon,
  Video,
  Info,
  X,
  Share2,
  Tag,
  ArrowRight,
  Sparkles,
  Check,
} from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function PromocionesListView() {
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Consultar promociones de Firestore
  const { data: promotions, loading } = useFirestoreQuery<Promotion>('promociones');

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[300px]">
        <CustomLoader />
      </div>
    );
  }

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const activePromotions = promotions?.filter(p => p.active && (!p.endDate || today <= p.endDate)) || [];

  const isVideo = (url: string) => {
    return (
      url.toLowerCase().includes('.mp4') ||
      url.toLowerCase().includes('.webm') ||
      (url.toLowerCase().includes('alt=media&token=') && url.includes('video'))
    );
  };

  const formatPeriod = (start?: any, end?: any) => {
    const fmt = (val: any) => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (val?.toDate) return format(val.toDate(), 'yyyy-MM-dd');
      if (val instanceof Date) return format(val, 'yyyy-MM-dd');
      return '';
    };
    const s = fmt(start);
    const e = fmt(end);
    if (!s && !e) return 'Por tiempo limitado';
    if (s && e) return `Del ${s} al ${e}`;
    if (e) return `Válida hasta el ${e}`;
    return `A partir del ${s}`;
  };

  const handleSharePromotion = (promo: Promotion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/promociones/${promo.id}/terminos`
      : '';
    if (navigator?.clipboard && url) {
      navigator.clipboard.writeText(url);
      setCopiedId(promo.id);
      toast({
        title: 'Enlace copiado',
        description: 'El enlace de la promoción se ha copiado al portapapeles.',
      });
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Cabecera Institucional Compacta */}
      <div className="pb-3 border-b border-border/60 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground uppercase">
              Promociones Activas
            </h2>
            <Badge variant="outline" className="text-[10px] font-sans font-medium py-0 px-2 rounded-full bg-blue-500/10 text-blue-400 border-blue-500/30">
              {activePromotions.length} {activePromotions.length === 1 ? 'activa' : 'activas'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consulta las ofertas y promociones vigentes para informar a los clientes o agendar citas.
          </p>
        </div>
      </div>

      {activePromotions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-2xl bg-muted/10">
          <ImageIcon className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-foreground">No hay promociones activas</h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            Actualmente no hay ninguna promoción vigente. Cuando se active una desde configuración, aparecerá aquí automáticamente.
          </p>
        </div>
      ) : (
        /* Cuadrícula de Tarjetas Horizontales Compactas (Estilo Idéntico a Web & App) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1">
          {activePromotions.map((promo) => {
            const promoTitle = promo.name || 'Promoción Especial';
            const promoDesc = promo.description || '';
            const promoImg = promo.imageUrl;
            const periodLabel = formatPeriod(promo.startDate, promo.endDate);
            const isMediaVideo = promoImg ? isVideo(promoImg) : false;

            return (
              <div
                key={promo.id}
                className="group relative bg-card rounded-2xl p-3 sm:p-3.5 border border-border/70 shadow-xs hover:shadow-md hover:border-blue-500/40 transition-all duration-300 flex flex-row items-stretch gap-3"
              >
                {/* Miniatura Vertical del Flyer a la izquierda (102px x 132px) */}
                <div
                  onClick={() => setSelectedPromotion(promo)}
                  className="relative w-[102px] sm:w-[110px] h-[128px] sm:h-[136px] shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-border/60 cursor-pointer select-none group/thumb"
                  title="Toca para ver el flyer completo"
                >
                  {promoImg ? (
                    isMediaVideo ? (
                      <video
                        src={promoImg}
                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={promoImg}
                        alt={promoTitle}
                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                      />
                    )
                  ) : (
                    <div className="absolute inset-0 bg-[#0F172A] flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                      <Sparkles className="w-6 h-6 text-blue-500 mb-1 opacity-60" />
                      <span className="text-[9px] font-bold text-slate-400">PROMO</span>
                    </div>
                  )}

                  {/* Gradiente inferior para destacar botón VER FLYER */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-transparent pointer-events-none" />

                  {/* Distintivo "VER FLYER" / "VER REEL" */}
                  <div className="absolute bottom-1.5 inset-x-1 flex justify-center pointer-events-none z-10">
                    <span className="text-[8.5px] uppercase tracking-wider text-blue-300 font-extrabold bg-slate-950/90 px-2 py-0.5 rounded-md border border-blue-400/35 shadow-xs">
                      {isMediaVideo ? 'VER REEL' : 'VER FLYER'}
                    </span>
                  </div>
                </div>

                {/* Columna derecha: Vigencia, Compartir, Título, Descripción breve y Botones */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  {/* Fila superior: Vigencia + Compartir */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/40 border border-border/60 text-foreground">
                      <Calendar className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="text-[10px] sm:text-[10.5px] font-semibold truncate leading-none">
                        {periodLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleSharePromotion(promo, e)}
                      title="Copiar enlace de la promoción"
                      className="h-7 w-7 rounded-lg border border-border/70 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {copiedId === promo.id ? (
                        <Check className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Bloque central: Título y descripción compactos */}
                  <div
                    onClick={() => setSelectedPromotion(promo)}
                    className="cursor-pointer my-1 space-y-0.5"
                    title="Ver detalles de la oferta"
                  >
                    <h3 className="text-sm sm:text-base font-extrabold text-foreground group-hover:text-blue-500 transition-colors line-clamp-1 leading-snug">
                      {promoTitle}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {promoDesc ? promoDesc.replace(/\s+/g, ' ').trim() : 'Consulta detalles y términos en sucursal.'}
                    </p>
                  </div>

                  {/* Fila inferior: Botones compactos (Detalles y Reservar / Agendar) */}
                  <div className="flex items-center gap-2 mt-auto pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedPromotion(promo)}
                      className="flex-1 h-8 px-2 rounded-lg border border-border/80 bg-card hover:bg-muted/40 text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Info className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>Detalles</span>
                    </button>

                    <Link
                      href="/agenda"
                      className="flex-[1.2] h-8 px-2.5 rounded-lg bg-[#202A49] hover:bg-[#18223c] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    >
                      <span>Reservar</span>
                      <ArrowRight className="w-3 h-3 text-white stroke-[2.5]" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Oficial de Detalle Completo de la Promoción */}
      <Dialog open={!!selectedPromotion} onOpenChange={(open) => !open && setSelectedPromotion(null)}>
        <DialogContent
          hideCloseButton={true}
          className="w-[95vw] sm:w-full max-w-lg max-h-[90dvh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background"
        >
          {/* Cabecera Oficial VATOS ALFA con Haz de Luz Láser */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Tag className="h-5 w-5 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    {selectedPromotion?.name || 'Detalle de la Promoción'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300 mt-0.5">
                    {formatPeriod(selectedPromotion?.startDate, selectedPromotion?.endDate)}
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPromotion(null)}
                className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Cuerpo del Modal: Flyer Vertical Completo y Términos */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 scrollbar-thin">
            {/* Flyer Vertical en Proporción Original sin Recortes */}
            {selectedPromotion?.imageUrl && (
              <div className="relative w-full max-w-sm mx-auto aspect-[4/5] rounded-2xl overflow-hidden bg-slate-900 border border-border/60 shadow-md flex items-center justify-center">
                {isVideo(selectedPromotion.imageUrl) ? (
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
                )}
              </div>
            )}

            {/* Descripción Completa */}
            {selectedPromotion?.description && (
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Detalles de la Oferta
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {selectedPromotion.description}
                </p>
              </div>
            )}

            {/* Términos y Condiciones */}
            {selectedPromotion?.termsAndConditions && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  Términos y Condiciones
                </h4>
                <div className="p-3 rounded-xl bg-muted/20 border border-border/60 text-xs text-muted-foreground leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto scrollbar-thin">
                  {selectedPromotion.termsAndConditions}
                </div>
              </div>
            )}
          </div>

          {/* Pie del Modal: Acciones */}
          <div className="p-3 sm:p-4 bg-muted/15 border-t border-border/50 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={(e) => selectedPromotion && handleSharePromotion(selectedPromotion, e)}
              className="h-8 px-3 rounded-lg border border-border/70 hover:bg-muted/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Compartir</span>
            </button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedPromotion(null)}
                className="h-8 text-xs cursor-pointer"
              >
                Cerrar
              </Button>
              <Button
                asChild
                variant="alfa"
                size="sm"
                className="h-8 text-xs font-semibold cursor-pointer"
              >
                <Link href="/agenda">
                  <span>Ir a la Agenda</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
