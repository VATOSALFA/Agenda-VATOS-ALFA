'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Tag, Calendar, ArrowRight, Share2, Info, X, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export interface PromotionItem {
  id: string;
  name?: string;
  titulo?: string;
  description?: string;
  descripcion?: string;
  imageUrl?: string;
  imagenUrl?: string;
  startDate?: string;
  endDate?: string;
  termsAndConditions?: string;
  terminos?: string;
  active?: boolean;
  code?: string;
  discount?: string;
}

interface AlfaPromotionsSectionProps {
  promotions: PromotionItem[];
  onBookPromotion?: (promotion: PromotionItem) => void;
  className?: string;
}

export function AlfaPromotionsSection({
  promotions = [],
  onBookPromotion,
  className,
}: AlfaPromotionsSectionProps) {
  const [selectedPromotion, setSelectedPromotion] = useState<PromotionItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!promotions || promotions.length === 0) {
    return null;
  }

  const handleSharePromotion = (promo: PromotionItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/promociones/${promo.id}/terminos`
      : '';
    if (navigator?.clipboard && url) {
      navigator.clipboard.writeText(url);
      setCopiedId(promo.id);
      toast({
        title: 'Enlace copiado',
        description: 'El enlace de la promoción y sus términos se ha copiado al portapapeles.',
      });
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const formatPeriod = (start?: string, end?: string) => {
    if (!end && !start) return 'Por tiempo limitado';
    if (start && end) {
      return `Del ${start} al ${end}`;
    }
    if (end) {
      return `Válido hasta el ${end}`;
    }
    return `A partir del ${start}`;
  };

  return (
    <section
      id="promociones"
      className={cn(
        "w-full py-14 sm:py-20 bg-slate-50/80 border-t border-border/60 scroll-mt-20",
        className
      )}
    >
      <div className="container px-4 md:px-6 max-w-6xl mx-auto">
        {/* Encabezado Institucional de la Sección */}
        <div className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 text-xs font-bold uppercase tracking-wider mb-2.5">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            <span>Promociones Especiales</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2.5 text-[#202A49]">
            Promociones y Ofertas
          </h2>
          <p className="text-xs sm:text-base text-slate-500 max-w-xl mx-auto leading-relaxed">
            Ofertas vigentes disponibles para todos nuestros clientes por tiempo limitado en sucursal.
          </p>
        </div>

        {/* Cuadrícula de Promociones en Formato Vertical */}
        <div
          className={cn(
            "grid gap-6 sm:gap-8 justify-center",
            promotions.length === 1 && "grid-cols-1 max-w-sm mx-auto",
            promotions.length === 2 && "grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto",
            promotions.length >= 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto"
          )}
        >
          {promotions.map((promo) => {
            const promoTitle = promo.name || promo.titulo || 'Promoción Especial';
            const promoDesc = promo.description || promo.descripcion || '';
            const promoImg = promo.imageUrl || promo.imagenUrl;
            const periodLabel = formatPeriod(promo.startDate, promo.endDate);

            return (
              <div
                key={promo.id}
                className="group relative bg-white rounded-3xl overflow-hidden border border-border/60 hover:border-blue-500/60 shadow-[0_10px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_40px_rgba(37,99,235,0.18)] transition-all duration-300 flex flex-col justify-between"
              >
                {/* Contenedor de Imagen de la Promoción en Formato Vertical (Aspect Ratio 4:5) */}
                <div
                  onClick={() => setSelectedPromotion(promo)}
                  className="relative w-full aspect-[4/5] overflow-hidden bg-slate-900 cursor-pointer select-none"
                >
                  {promoImg ? (
                    <Image
                      src={promoImg}
                      alt={promoTitle}
                      fill
                      quality={92}
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                      unoptimized={true}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#0F172A] flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                      <Sparkles className="w-10 h-10 text-blue-500 mb-2 opacity-60" />
                      <span className="text-xs font-medium">VATOS ALFA</span>
                    </div>
                  )}

                  {/* Gradiente sutil inferior para legibilidad */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                  {/* Distintivo de Vigencia Superior */}
                  <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none z-10">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#202A49]/90 backdrop-blur-md text-white text-[11px] font-bold shadow-md border border-white/10 font-sans">
                      <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                      <span>{periodLabel}</span>
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleSharePromotion(promo, e)}
                      title="Compartir enlace de la promoción"
                      className="pointer-events-auto p-2 rounded-xl bg-black/50 hover:bg-black/80 backdrop-blur-md text-slate-300 hover:text-white transition-colors border border-white/10 shadow-md cursor-pointer"
                    >
                      {copiedId === promo.id ? (
                        <Check className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Indicador de "Toca para ampliar" en la base de la imagen */}
                  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-white/90 text-xs font-semibold drop-shadow-md pointer-events-none z-10">
                    <span className="line-clamp-1">{promoTitle}</span>
                    <span className="text-[10px] uppercase tracking-wider text-blue-300 font-bold bg-blue-950/70 px-2 py-0.5 rounded-md border border-blue-400/30 shrink-0 ml-2">
                      Ver flyer
                    </span>
                  </div>
                </div>

                {/* Contenido y Botones de la Tarjeta */}
                <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-3.5 bg-white">
                  <div className="space-y-1.5">
                    <h3 className="font-extrabold text-base sm:text-lg text-[#202A49] group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                      {promoTitle}
                    </h3>
                    {promoDesc ? (
                      <p className="text-xs sm:text-sm text-slate-600 line-clamp-3 leading-relaxed">
                        {promoDesc}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        Consulta detalles y términos con tu barbero en sucursal.
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedPromotion(promo)}
                      className="rounded-xl border-border/60 text-xs font-medium h-9 text-slate-700 hover:text-[#202A49] hover:bg-slate-100 flex items-center justify-center gap-1.5"
                    >
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Términos y detalles</span>
                    </Button>

                    <Button
                      type="button"
                      variant="alfa"
                      size="sm"
                      onClick={() => {
                        if (onBookPromotion) {
                          onBookPromotion(promo);
                        } else if (typeof window !== 'undefined') {
                          window.location.href = '/reservar';
                        }
                      }}
                      className="rounded-xl text-xs font-bold text-white h-9 flex-1 flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <span>Reservar Cita</span>
                      <ArrowRight className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                    {selectedPromotion?.name || selectedPromotion?.titulo || 'Detalle de la Promoción'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300 mt-0.5">
                    {formatPeriod(selectedPromotion?.startDate, selectedPromotion?.endDate)}
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPromotion(null)}
                className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Cuerpo del Modal: Flyer Vertical Completo y Términos */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 scrollbar-thin">
            {/* Flyer Vertical en Proporción Original sin Recortes */}
            {(selectedPromotion?.imageUrl || selectedPromotion?.imagenUrl) && (
              <div className="relative w-full max-w-sm mx-auto aspect-[4/5] rounded-2xl overflow-hidden bg-slate-900 border border-border/60 shadow-md">
                <Image
                  src={(selectedPromotion?.imageUrl || selectedPromotion?.imagenUrl)!}
                  alt={selectedPromotion?.name || selectedPromotion?.titulo || 'Promoción'}
                  fill
                  quality={95}
                  className="object-contain"
                  unoptimized={true}
                />
              </div>
            )}

            {/* Descripción Completa */}
            {(selectedPromotion?.description || selectedPromotion?.descripcion) && (
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Detalles de la Oferta
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {selectedPromotion.description || selectedPromotion.descripcion}
                </p>
              </div>
            )}

            {/* Términos y Condiciones */}
            {(selectedPromotion?.termsAndConditions || selectedPromotion?.terminos) && (
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  <span>Términos y Condiciones</span>
                </h4>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-xs text-muted-foreground leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto scrollbar-thin">
                  {selectedPromotion.termsAndConditions || selectedPromotion.terminos}
                </div>
              </div>
            )}
          </div>

          {/* Pie del Modal: Compartir y Reservar */}
          <div className="p-3 sm:p-4 bg-muted/20 border-t border-border/40 flex items-center justify-between gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => selectedPromotion && handleSharePromotion(selectedPromotion)}
              className="rounded-xl border-border/60 text-xs font-medium h-10 px-3.5"
            >
              {selectedPromotion && copiedId === selectedPromotion.id ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-blue-500" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  <span>Compartir</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="alfa"
              size="sm"
              onClick={() => {
                const promo = selectedPromotion;
                setSelectedPromotion(null);
                if (promo && onBookPromotion) {
                  onBookPromotion(promo);
                } else if (typeof window !== 'undefined') {
                  window.location.href = '/reservar';
                }
              }}
              className="rounded-xl text-xs font-bold text-white h-10 px-5 flex-1 shadow-md"
            >
              <span>Agendar con esta Promoción</span>
              <ArrowRight className="w-3.5 h-3.5 text-white ml-1 stroke-[2.5]" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
