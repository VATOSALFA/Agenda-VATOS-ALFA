'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';
import { Sparkles, ArrowRight, Award, Tag, X, ChevronDown, Smartphone, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlfaGoldSmokeBurst } from '@/components/ui/alfa-gold-smoke-burst';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export interface BenefitItem {
  id: string;
  tag: string;
  discount?: string;
  titulo: string;
  descripcion: string;
  recompensa?: string;
  vigencia?: string;
  terminos?: string;
  codigo?: string;
  imagenUrl?: string;
  badgeType?: 'vip' | 'gold' | 'promo';
  ctaText?: string;
}

interface AlfaBenefitsSectionProps {
  promotions?: any[];
  paseAlfaData?: any;
  onBookBenefit?: (benefit: BenefitItem) => void;
  onDownloadApp?: () => void;
  className?: string;
}

interface StickyBenefitCardProps {
  benefit: BenefitItem;
  index: number;
  totalCards: number;
  progress: MotionValue<number>;
  isActive: boolean;
  onSelect: (b: BenefitItem) => void;
}

/**
 * Genera rangos continuos y suaves para Framer Motion,
 * recreando la baraja física 3D idéntica a StickyPromoStack de la app móvil.
 */
function getCardTransforms(index: number, totalCards: number) {
  if (totalCards <= 1) {
    return {
      inputRange: [0, 1],
      yOutput: [0, 0],
      scaleOutput: [1, 1],
      opacityOutput: [1, 1],
      brightnessOutput: [1, 1],
    };
  }

  const steps = totalCards - 1;
  const stepSize = 1 / steps;
  const points: number[] = [0];

  for (let s = 0; s < steps; s++) {
    const sStart = Number((s * stepSize + 0.05 * stepSize).toFixed(4));
    const sEnd = Number(((s + 1) * stepSize - 0.05 * stepSize).toFixed(4));
    if (!points.includes(sStart)) points.push(sStart);
    if (!points.includes(sEnd)) points.push(sEnd);
  }
  if (!points.includes(1.0)) points.push(1.0);
  points.sort((a, b) => a - b);

  const yOutput: number[] = [];
  const scaleOutput: number[] = [];
  const opacityOutput: number[] = [];
  const brightnessOutput: number[] = [];

  for (const p of points) {
    if (index === 0) {
      const cardsAbove = Math.min(steps, Math.max(0, p / stepSize));
      const yVal = -Math.round(cardsAbove * 14);
      const scaleVal = Number(Math.max(0.85, 1.0 - cardsAbove * 0.05).toFixed(3));
      const brightVal = Number(Math.max(0.68, 1.0 - cardsAbove * 0.12).toFixed(3));
      yOutput.push(yVal);
      scaleOutput.push(scaleVal);
      opacityOutput.push(1.0);
      brightnessOutput.push(brightVal);
    } else {
      const entryStart = (index - 1) * stepSize + 0.05 * stepSize;
      const entryEnd = index * stepSize - 0.05 * stepSize;

      if (p <= entryStart) {
        yOutput.push(75);
        scaleOutput.push(0.95);
        opacityOutput.push(0.2);
        brightnessOutput.push(0.88);
      } else if (p < entryEnd) {
        const t = (p - entryStart) / (entryEnd - entryStart);
        yOutput.push(Math.round(75 * (1 - t)));
        scaleOutput.push(Number((0.95 + 0.05 * t).toFixed(3)));
        opacityOutput.push(Number((0.2 + 0.8 * t).toFixed(3)));
        brightnessOutput.push(Number((0.88 + 0.12 * t).toFixed(3)));
      } else {
        const cardsAbove = Math.min(
          totalCards - 1 - index,
          Math.max(0, (p - (index * stepSize - 0.05 * stepSize)) / stepSize)
        );
        yOutput.push(-Math.round(cardsAbove * 14));
        scaleOutput.push(Number(Math.max(0.85, 1.0 - cardsAbove * 0.05).toFixed(3)));
        opacityOutput.push(1.0);
        brightnessOutput.push(Number(Math.max(0.68, 1.0 - cardsAbove * 0.12).toFixed(3)));
      }
    }
  }

  return {
    inputRange: points,
    yOutput,
    scaleOutput,
    opacityOutput,
    brightnessOutput,
  };
}

function StickyBenefitCard({
  benefit,
  index,
  totalCards,
  progress,
  isActive,
  onSelect,
}: StickyBenefitCardProps) {
  const { inputRange, yOutput, scaleOutput, opacityOutput, brightnessOutput } = useMemo(
    () => getCardTransforms(index, totalCards),
    [index, totalCards]
  );

  const y = useTransform(progress, inputRange, yOutput);
  const scale = useTransform(progress, inputRange, scaleOutput);
  const opacity = useTransform(progress, inputRange, opacityOutput);
  const brightness = useTransform(progress, inputRange, brightnessOutput);
  const filter = useTransform(brightness, (b) => `brightness(${b})`);

  // Limpieza de etiqueta de descuento
  const rawDiscount = benefit.discount || '';
  const discountLabel = rawDiscount
    ? rawDiscount.includes('%') || rawDiscount.includes('GRATIS') || rawDiscount.includes('PUNTOS') || rawDiscount.includes('CLUB')
      ? rawDiscount
      : `-${rawDiscount}% OFF`
    : null;

  return (
    <motion.div
      style={{
        y,
        scale,
        opacity,
        filter,
        zIndex: (index + 1) * 10,
        transformOrigin: 'top center',
      }}
      onClick={() => onSelect(benefit)}
      className={cn(
        "group absolute inset-x-2 sm:inset-x-0 h-[195px] sm:h-[220px] rounded-2xl sm:rounded-3xl p-[1.5px] overflow-hidden bg-slate-900 border transition-all duration-300 cursor-pointer select-none",
        isActive
          ? "border-blue-500/80 shadow-[0_16px_40px_rgba(37,99,235,0.35)]"
          : "border-white/20 hover:border-blue-500/60 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      )}
    >
      {/* Haz de luz láser rotatorio perimetral (NeonGlowCard / ShinyButton) */}
      <span
        className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none animate-conic-laser transition-opacity duration-300 z-0",
          isActive ? "opacity-85" : "opacity-30 group-hover:opacity-100"
        )}
        aria-hidden="true"
      />

      {/* Cuerpo interior de la tarjeta */}
      <div className="relative z-10 w-full h-full rounded-[14.5px] sm:rounded-[22.5px] bg-[#0F172A] overflow-hidden">
        {/* Imagen de Fondo 100% Original */}
        {benefit.imagenUrl ? (
          <Image
            src={benefit.imagenUrl}
            alt={benefit.titulo}
            fill
            quality={90}
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, 600px"
            unoptimized={true}
          />
        ) : (
          <div className="absolute inset-0 bg-[#0F172A] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-blue-500" />
          </div>
        )}

        {/* Degradado inferior para legibilidad del título idéntico a la app móvil */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-10 pointer-events-none"
          aria-hidden="true"
        />

        {/* Contenido de la Tarjeta */}
        <div className="relative z-20 w-full h-full p-4 sm:p-5 flex flex-col justify-between">
          {/* Top Row: Descuento o Distintivo en la esquina superior derecha */}
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            {discountLabel ? (
              <div className="bg-[#2563EB] text-white text-[10px] sm:text-[11px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider shadow-md">
                {discountLabel}
              </div>
            ) : null}
          </div>

          {/* Bottom Row: Título limpio en negrita y botón circular con flecha */}
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex-1 text-white font-extrabold text-sm sm:text-base tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] line-clamp-2 leading-snug">
              {benefit.titulo}
            </h3>

            <div className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center text-white shadow-[0_2px_8px_rgba(37,99,235,0.45)] group-hover:scale-110 group-hover:bg-blue-500 transition-transform duration-200 shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-white stroke-[2.5]" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function AlfaBenefitsSection({
  promotions = [],
  paseAlfaData,
  onBookBenefit,
  onDownloadApp,
  className,
}: AlfaBenefitsSectionProps) {
  const [selectedBenefit, setSelectedBenefit] = useState<BenefitItem | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionTrackRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Default Club Benefits
  const defaultClubBenefits: BenefitItem[] = useMemo(() => [
    {
      id: 'pase-alfa-10',
      tag: 'PROGRAMA DE LEALTAD',
      discount: `${paseAlfaData?.sellosRequeridos || 10}ª GRATIS`,
      badgeType: 'vip',
      titulo: paseAlfaData?.titulo || 'La 10ª Visita va por la Casa',
      descripcion: paseAlfaData?.subtitulo || paseAlfaData?.instrucciones || 'En VATOS ALFA premiamos tu lealtad. Acumula 9 visitas en cualquiera de nuestros servicios pagados y tu décimo corte de cabello es 100% de cortesía.',
      recompensa: paseAlfaData?.recompensa || 'Corte de Cabello 100% Gratis',
      vigencia: 'Vigencia Permanente • Pase Alfa Club',
      terminos: paseAlfaData?.terminos || 'Aplica en todas las sucursales oficiales de VATOS ALFA. Válido para clientes registrados. No es transferible ni acumulable con otras promociones de corte gratuito en la misma cita.',
      imagenUrl: paseAlfaData?.imagenUrl || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80',
      ctaText: 'Agendar para Acumular Sello',
    },
    {
      id: 'cumpleanos-alfa',
      tag: 'CORTESÍA DE CUMPLEAÑOS',
      discount: '100% OFF',
      badgeType: 'gold',
      titulo: 'Corte Gratis en el Mes de tu Cumpleaños',
      descripcion: 'Queremos festejar contigo. Durante todo el mes de tu cumpleaños, disfruta de tu corte de cabello de cortesía y atenciones VIP exclusivas.',
      recompensa: 'Corte de Cabello de Cumpleaños sin costo',
      vigencia: 'Válido durante todo tu mes de cumpleaños',
      terminos: 'Presenta tu identificación oficial (INE o pasaporte) en recepción para validar tu fecha de nacimiento al momento de tu cita.',
      imagenUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
      ctaText: 'Agendar Mi Corte de Cumpleaños',
    },
    {
      id: 'alfacoins-club',
      tag: 'ALFA COINS & RECOMPENSAS',
      discount: 'PUNTOS',
      badgeType: 'vip',
      titulo: 'Gana ALFA COINS en Cada Servicio',
      descripcion: 'Cada vez que te atiendes en nuestra barbería acumulas ALFA COINS que puedes canjear directamente por productos de peinado, ceras, tónicos o descuentos.',
      recompensa: 'Canjeable por Ceras, Polvos y Bálsamos',
      vigencia: 'Vigencia Permanente',
      terminos: 'Los puntos ALFA COINS se acreditan automáticamente a tu cuenta registrada al finalizar cada cita atendida.',
      imagenUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80',
      ctaText: 'Conocer Dinámica del Club',
    },
  ], [paseAlfaData]);

  // Dynamic VIP privileges configured in Pase Alfa (Privilegios VIP)
  const dynamicPrivilegios: BenefitItem[] = useMemo(() => {
    const rawPrivilegios = Array.isArray(paseAlfaData?.beneficios_detallados)
      ? paseAlfaData.beneficios_detallados
      : (Array.isArray(paseAlfaData?.privilegios) ? paseAlfaData.privilegios : []);

    return rawPrivilegios
      .filter((p: any) => p && p.activo !== false)
      .map((p: any) => ({
        id: p.id || `vip_${p.titulo || Math.random()}`,
        tag: 'PRIVILEGIO VIP',
        discount: 'CLUB ALFA',
        badgeType: 'gold' as const,
        titulo: p.titulo || 'Beneficio Exclusivo',
        descripcion: p.descripcion || 'Privilegio exclusivo para miembros del Club Pase Alfa.',
        recompensa: p.recompensa,
        vigencia: p.fechaLimite ? `Hasta el ${p.fechaLimite}` : 'Permanente • Pase Alfa Club',
        terminos: p.terminos || 'Exclusivo para clientes registrados en la app móvil.',
        imagenUrl: p.imagenUrl || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
        ctaText: 'Aprovechar Beneficio',
      }));
  }, [paseAlfaData]);

  // Convert Firebase promotions to BenefitItems if available
  const promoBenefits: BenefitItem[] = useMemo(() => {
    return promotions.map((p) => ({
      id: p.id,
      tag: p.discount ? `OFERTA EXCLUSIVA` : 'PROMOCIÓN ACTIVA',
      discount: p.discount ? `-${p.discount}% OFF` : (p.code ? `CÓDIGO: ${p.code}` : undefined),
      badgeType: 'promo' as const,
      titulo: p.name || p.titulo || 'Beneficio Exclusivo',
      descripcion: p.description || p.descripcion || 'Aprovecha este beneficio exclusivo en tu próxima cita en VATOS ALFA.',
      vigencia: p.endDate ? `Válido hasta el ${p.endDate}` : 'Por tiempo limitado',
      terminos: p.termsAndConditions || p.terminos || 'Válido en sucursales participantes de VATOS ALFA.',
      codigo: p.code || p.codigo,
      imagenUrl: p.imageUrl || p.imagenUrl || 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80',
      ctaText: 'Aprovechar Beneficio',
    }));
  }, [promotions]);

  const allBenefits = useMemo(() => {
    const clubList = dynamicPrivilegios.length > 0
      ? (paseAlfaData?.activo === false ? dynamicPrivilegios : [defaultClubBenefits[0], ...dynamicPrivilegios])
      : (paseAlfaData?.activo === false ? defaultClubBenefits.slice(1) : defaultClubBenefits);

    return [...clubList, ...promoBenefits];
  }, [dynamicPrivilegios, paseAlfaData?.activo, defaultClubBenefits, promoBenefits]);

  // Seguimiento del scroll de la pista para animar la baraja 3D idéntica a la app móvil
  const { scrollYProgress } = useScroll({
    target: sectionTrackRef,
    offset: ['start start', 'end end'],
  });

  // Sincronizar el índice de tarjeta activo con el scroll en tiempo real
  useEffect(() => {
    const steps = Math.max(1, allBenefits.length - 1);
    const stepSize = 1 / steps;

    const unsubscribe = scrollYProgress.on('change', (latest) => {
      let idx = 0;
      for (let s = 0; s < steps; s++) {
        if (latest >= (s + 0.45) * stepSize) {
          idx = s + 1;
        }
      }
      setActiveIndex(Math.min(allBenefits.length - 1, idx));
    });

    return () => unsubscribe();
  }, [scrollYProgress, allBenefits.length]);

  // Salto suave e interactivo a una tarjeta específica mediante clic o flechas
  const handleJumpToCard = (targetIdx: number) => {
    if (!sectionTrackRef.current) return;
    const rect = sectionTrackRef.current.getBoundingClientRect();
    const currentScrollY = window.scrollY;
    const trackTop = currentScrollY + rect.top;
    const steps = Math.max(1, allBenefits.length - 1);
    const stepSize = 1 / steps;
    const targetProgress = targetIdx === 0 ? 0.02 : (targetIdx === steps ? 0.98 : targetIdx * stepSize);
    const scrollableDistance = sectionTrackRef.current.offsetHeight - window.innerHeight;
    const targetY = trackTop + targetProgress * scrollableDistance;

    if (typeof window !== 'undefined' && (window as any).__lenis) {
      (window as any).__lenis.scrollTo(targetY, { duration: 0.8 });
    } else {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  };

  // Manejo de gestos táctiles para deslizar entre tarjetas en celular
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0 && activeIndex < allBenefits.length - 1) {
        handleJumpToCard(activeIndex + 1);
      } else if (deltaX > 0 && activeIndex > 0) {
        handleJumpToCard(activeIndex - 1);
      }
    }
  };

  // Altura proporcional de pista de scroll para permitir despliegue y apilado fluido
  const trackHeightStyle = useMemo(() => {
    if (allBenefits.length <= 1) return 'auto';
    return `${Math.max(130, 100 + (allBenefits.length - 1) * 38)}vh`;
  }, [allBenefits.length]);

  return (
    <div
      id="beneficios"
      ref={sectionTrackRef}
      className={cn("relative w-full bg-white scroll-mt-20", className)}
      style={{ minHeight: trackHeightStyle }}
    >
      {/* Escenario Fijado (Sticky Stage) que permanece en pantalla mientras se apilan las tarjetas */}
      <div className="sticky top-[64px] sm:top-[76px] z-20 w-full flex flex-col items-center justify-start py-4 px-4 overflow-visible">
        {/* Encabezado Institucional Vatos Alfa */}
        <div className="w-full max-w-xl mx-auto text-center mb-2 sm:mb-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Beneficios Exclusivos</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1 sm:mb-2 text-[#202A49]">
            Beneficios del Club Alfa
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Desliza para ver la baraja o toca cualquier tarjeta para ver su dinámica exclusiva
          </p>

          {onDownloadApp && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={onDownloadApp}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C5A880] hover:text-[#e4cfb7] transition-colors py-1 px-3 rounded-full border border-[#C5A880]/30 hover:border-[#C5A880]/60 bg-[#C5A880]/10 hover:bg-[#C5A880]/20 cursor-pointer shadow-2xs"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#C5A880]" />
                <span>Descargar App Oficial (Club Alfa)</span>
              </button>
            </div>
          )}
        </div>

        {/* Barra de Navegación Rápida / Indicador de Tarjetas */}
        {allBenefits.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 my-1.5 sm:my-2 z-30">
            {/* Flecha Anterior */}
            <button
              type="button"
              onClick={() => handleJumpToCard(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
                activeIndex === 0
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              )}
              aria-label="Beneficio anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Pastillas Interactivas de Beneficio */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {allBenefits.map((b, idx) => {
                const isCurrent = activeIndex === idx;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleJumpToCard(idx)}
                    className={cn(
                      "cursor-pointer transition-all duration-300 flex items-center gap-1.5",
                      isCurrent
                        ? "bg-[#202A49] text-white shadow-sm px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium"
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-colors",
                        isCurrent ? "bg-blue-400 animate-pulse" : "bg-slate-400"
                      )}
                    />
                    <span className="truncate max-w-[85px] sm:max-w-[130px]">
                      {idx === 0
                        ? "10ª Visita"
                        : idx === 1
                        ? "Cumpleaños"
                        : idx === 2
                        ? "Alfa Coins"
                        : b.titulo.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Flecha Siguiente */}
            <button
              type="button"
              onClick={() => handleJumpToCard(Math.min(allBenefits.length - 1, activeIndex + 1))}
              disabled={activeIndex === allBenefits.length - 1}
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
                activeIndex === allBenefits.length - 1
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              )}
              aria-label="Beneficio siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Baraja 3D de Tarjetas Apilables (Sticky Stacking Deck con Deslizamiento y Gestos) */}
        <div
          className="relative w-full max-w-xl mx-auto h-[230px] sm:h-[260px] mt-2 select-none touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {allBenefits.map((benefit, index) => (
            <StickyBenefitCard
              key={benefit.id}
              benefit={benefit}
              index={index}
              totalCards={allBenefits.length}
              progress={scrollYProgress}
              isActive={activeIndex === index}
              onSelect={(b) => {
                setShowTerms(false);
                setSelectedBenefit(b);
              }}
            />
          ))}
        </div>
      </div>

      {/* Benefit Detail Modal (Estilo App Móvil con Cabecera Oficial, Resplandor Dorado Mate y Doble Luz) */}
      <Dialog
        open={!!selectedBenefit}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBenefit(null);
            setShowTerms(false);
          }
        }}
      >
        <DialogContent
          hideCloseButton={true}
          className="w-[calc(100%-2.5rem)] sm:w-full max-w-lg bg-transparent border-none shadow-none p-0 overflow-visible flex flex-col justify-center items-center max-h-[90vh] z-50 gap-0"
        >
          {/* Resplandor de Luz Dorada Mate (Puro destello de luz, sin marco perimetral) */}
          <AlfaGoldSmokeBurst key={selectedBenefit?.id || 'benefit-smoke'} />

          {/* Contenedor Oficial del Modal */}
          <div className="relative z-10 w-full bg-white rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border-2 border-blue-500 flex flex-col max-h-[85vh]">
            {/* Header Oficial Vatos Alfa con Haz de Luz (shrink-0 para evitar cortes en el título) */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-5 py-4 text-white">
              <div className="header-light-beam" />
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Sparkles className="w-5 h-5 text-slate-300 shrink-0" />
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide leading-normal truncate">
                    {selectedBenefit?.titulo}
                  </DialogTitle>
                </div>
                <button
                  onClick={() => {
                    setSelectedBenefit(null);
                    setShowTerms(false);
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                  aria-label="Cerrar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {selectedBenefit?.tag && (
                <DialogDescription className="text-xs text-slate-300 mt-1 pl-7.5 leading-normal">
                  {selectedBenefit.tag}
                </DialogDescription>
              )}
            </div>

            {/* Modal Body (con min-h-0 flex-1 overflow-y-auto overscroll-contain para scroll fluido garantizado) */}
            <div className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4 overscroll-contain">
              {/* Image Preview 100% Original sin filtros oscuros ni contrastes añadidos */}
              {selectedBenefit?.imagenUrl && (
                <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-md">
                  <Image
                    src={selectedBenefit.imagenUrl}
                    alt={selectedBenefit.titulo}
                    fill
                    quality={100}
                    className="object-cover"
                    unoptimized={true}
                  />
                  {selectedBenefit.discount && (
                    <div className="absolute top-3 right-3 bg-blue-600 text-white font-black text-xs px-3 py-1 rounded-full shadow-lg">
                      {selectedBenefit.discount}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {selectedBenefit?.descripcion}
              </p>

              {/* Recompensa */}
              {selectedBenefit?.recompensa && (
                <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200/60 flex items-center gap-3">
                  <Award className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 block">
                      Beneficio Incluido:
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {selectedBenefit.recompensa}
                    </span>
                  </div>
                </div>
              )}

              {/* Coupon Code if exists */}
              {selectedBenefit?.codigo && (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-500" />
                    <span className="text-xs text-slate-600">Código de Descuento:</span>
                    <span className="text-xs font-bold text-slate-900">{selectedBenefit.codigo}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-semibold"
                    onClick={() => {
                      if (selectedBenefit.codigo) {
                        navigator.clipboard.writeText(selectedBenefit.codigo);
                        toast({
                          title: "Código copiado",
                          description: `El código "${selectedBenefit.codigo}" se ha copiado al portapapeles.`,
                        });
                      }
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              )}

              {/* Terms and Conditions (Minimizado por defecto con opción de maximizar) */}
              {selectedBenefit?.terminos && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowTerms((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors group cursor-pointer"
                  >
                    <span className="uppercase tracking-wider">
                      Términos y Condiciones
                    </span>
                    <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                      <span>{showTerms ? 'Ocultar' : 'Ver términos'}</span>
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-blue-600 transition-transform duration-200",
                          showTerms && "rotate-180"
                        )}
                      />
                    </span>
                  </button>
                  {showTerms && (
                    <div className="mt-1 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed whitespace-pre-line animate-in fade-in-50 duration-200 max-h-56 overflow-y-auto overscroll-contain">
                      {selectedBenefit.terminos}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer CTA (shrink-0 para estar siempre anclado) */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex shrink-0">
              <Button
                variant="alfa"
                className="w-full rounded-xl h-11 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 shadow-md"
                onClick={() => {
                  const b = selectedBenefit;
                  setSelectedBenefit(null);
                  setShowTerms(false);
                  if (onBookBenefit && b) {
                    onBookBenefit(b);
                  }
                }}
              >
                <span>{selectedBenefit?.ctaText || 'Aprovechar Beneficio'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
