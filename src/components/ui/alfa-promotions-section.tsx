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
        "w-full py-8 sm:py-12 bg-slate-50/80 border-t border-border/60 scroll-mt-20",
        className
      )}
    >
      <div className="container px-4 md:px-6 max-w-5xl mx-auto">
        {/* Encabezado Institucional Compacto (Estilo App Móvil) */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 text-[10.5px] font-extrabold uppercase tracking-wider mb-2">
            <Tag className="w-3 h-3 text-blue-600" />
            <span>
              {promotions.length > 1
                ? `${promotions.length} PROMOCIONES ESPECIALES`
                : 'PROMOCIONES ESPECIALES'}
            </span>
          </div>
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight mb-1 text-[#202A49]">
            Promociones y Ofertas
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            {promotions.length > 1
              ? `${promotions.length} ofertas vigentes disponibles por tiempo limitado en sucursal.`
              : 'Ofertas vigentes disponibles por tiempo limitado en sucursal.'}
          </p>
        </div>

        {/* Lista de Tarjetas Horizontales Compactas (Estilo App Móvil) */}
        <div
          className={cn(
            "grid gap-4 justify-center",
            promotions.length === 1 && "grid-cols-1 max-w-md sm:max-w-lg mx-auto w-full",
            promotions.length === 2 && "grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto w-full",
            promotions.length >= 3 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 max-w-6xl mx-auto w-full"
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
                className="group relative bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(37,99,235,0.12)] hover:border-blue-500/40 transition-all duration-300 flex flex-row items-stretch gap-3"
              >
                {/* Miniatura Vertical del Flyer a la izquierda (toca para abrir modal con flyer completo) */}
                <div
                  onClick={() => setSelectedPromotion(promo)}
                  className="relative w-[102px] sm:w-[110px] h-[128px] sm:h-[136px] shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-slate-200/80 cursor-pointer select-none group/thumb"
                  title="Toca para ver el flyer completo"
                >
                  {promoImg ? (
                    <Image
                      src={promoImg}
                      alt={promoTitle}
                      fill
                      quality={92}
                      className="object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 110px, 120px"
                      unoptimized={true}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#0F172A] flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                      <Sparkles className="w-6 h-6 text-blue-500 mb-1 opacity-60" />
                      <span className="text-[9px] font-bold text-slate-400">PROMO</span>
                    </div>
                  )}

                  {/* Gradiente inferior para destacar botón VER FLYER */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-transparent pointer-events-none" />

                  {/* Distintivo "VER FLYER" */}
                  <div className="absolute bottom-1.5 inset-x-1 flex justify-center pointer-events-none z-10">
                    <span className="text-[8.5px] uppercase tracking-wider text-blue-300 font-extrabold bg-slate-950/90 px-2 py-0.5 rounded-md border border-blue-400/35 shadow-sm">
                      VER FLYER
                    </span>
                  </div>
                </div>

                {/* Columna derecha: Vigencia, Compartir, Título, Descripción breve y Botones */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  {/* Fila superior: Vigencia + Compartir */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100/90 border border-slate-200/70 text-slate-700">
                      <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                      <span className="text-[10px] sm:text-[10.5px] font-semibold truncate leading-none">
                        {periodLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleSharePromotion(promo, e)}
                      title="Compartir enlace de la promoción"
                      className="h-7 w-7 rounded-lg border border-slate-200/80 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {copiedId === promo.id ? (
                        <Check className="w-3.5 h-3.5 text-blue-600" />
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
                    <h3 className="text-sm sm:text-base font-extrabold text-[#202A49] group-hover:text-blue-600 transition-colors line-clamp-1 leading-snug">
                      {promoTitle}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {promoDesc ? promoDesc.replace(/\s+/g, ' ').trim() : 'Consulta detalles y términos en sucursal.'}
                    </p>
                  </div>

                  {/* Fila inferior: Botones compactos (Detalles y Reservar) */}
                  <div className="flex items-center gap-2 mt-auto pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedPromotion(promo)}
                      className="flex-1 h-8 px-2 rounded-lg border border-slate-300/80 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Info className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>Detalles</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onBookPromotion) {
                          onBookPromotion(promo);
                        } else if (typeof window !== 'undefined') {
                          window.location.href = '/reservar';
                        }
                      }}
                      className="flex-[1.2] h-8 px-2.5 rounded-lg bg-[#202A49] hover:bg-[#18223c] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                    >
                      <span>Reservar</span>
                      <ArrowRight className="w-3 h-3 text-white stroke-[2.5]" />
                    </button>
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
