'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Sparkles, ChevronLeft, ChevronRight, X, Scissors, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlfaGoldSmokeBurst } from '@/components/ui/alfa-gold-smoke-burst';
import { cn } from '@/lib/utils';
import { LookbookStyle, LOOKBOOK_STYLES } from '@/data/lookbook-styles';

interface Alfa3DCarouselProps {
  stylesList?: LookbookStyle[];
  onSelectStyle?: (style: LookbookStyle) => void;
  onBookStyle?: (style: LookbookStyle) => void;
  className?: string;
}

const STEP_ANGLE = 36; // 36 degrees (10 cylinder faces)
const SLOTS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const DEG_TO_RAD = Math.PI / 180;
const AUTOPLAY_INTERVAL_MS = 3400;
const RESUME_DELAY_MS = 4500;

export function Alfa3DCarousel({
  stylesList = LOOKBOOK_STYLES,
  onSelectStyle,
  onBookStyle,
  className,
}: Alfa3DCarouselProps) {
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Responsive dimensions scaled for mobile, tablet, desktop and widescreen
  const [stageDimensions, setStageDimensions] = useState({
    cardSize: 260,
    radius: 360,
    stageHeight: 410,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const w = window.innerWidth;
      if (w < 640) {
        // Mobile (< 640px)
        const cSize = Math.round(Math.min(160, w * 0.42));
        setStageDimensions({
          cardSize: cSize,
          radius: Math.round(w * 0.38),
          stageHeight: 280,
        });
      } else if (w < 1024) {
        // Tablet (640px - 1023px)
        setStageDimensions({
          cardSize: 200,
          radius: 260,
          stageHeight: 330,
        });
      } else if (w < 1440) {
        // Desktop standard (1024px - 1439px)
        setStageDimensions({
          cardSize: 260,
          radius: 360,
          stageHeight: 410,
        });
      } else {
        // Widescreen / 2K+ (>= 1440px)
        setStageDimensions({
          cardSize: 310,
          radius: 450,
          stageHeight: 480,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Modal detail state
  const [selectedStyleForModal, setSelectedStyleForModal] = useState<LookbookStyle | null>(null);

  const totalPhotos = stylesList?.length || 0;
  const centerOffset = -rotation / STEP_ANGLE;
  const currentCenterIndex = Math.round(centerOffset);
  const activeStyleIndex =
    totalPhotos > 0 ? ((currentCenterIndex % totalPhotos) + totalPhotos) % totalPhotos : 0;
  const currentDisplayIndex = activeStyleIndex + 1;
  const activeStyle = stylesList?.[activeStyleIndex] || stylesList?.[0];
  const activeFaceIndex = ((currentCenterIndex % 10) + 10) % 10;

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const animateToAngle = useCallback(
    (targetAngle: number, duration = 380, onComplete?: () => void) => {
      stopAnimation();
      const start = rotationRef.current;
      const diff = targetAngle - start;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        const curr = start + diff * ease;

        rotationRef.current = curr;
        setRotation(curr);

        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          rotationRef.current = targetAngle;
          setRotation(targetAngle);
          animFrameRef.current = null;
          onComplete?.();
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [stopAnimation]
  );

  // Autoplay management
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null);
  const idleTimeout = useRef<NodeJS.Timeout | null>(null);
  const isInteracting = useRef(false);

  const startAutoPlay = useCallback(() => {
    if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
    autoPlayTimer.current = setInterval(() => {
      if (!isInteracting.current && !selectedStyleForModal) {
        const nextAngle = rotationRef.current - STEP_ANGLE;
        animateToAngle(nextAngle, 620);
      }
    }, AUTOPLAY_INTERVAL_MS);
  }, [animateToAngle, selectedStyleForModal]);

  const pauseAutoPlay = useCallback(() => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    if (idleTimeout.current) {
      clearTimeout(idleTimeout.current);
      idleTimeout.current = null;
    }
  }, []);

  const scheduleResume = useCallback(() => {
    if (idleTimeout.current) clearTimeout(idleTimeout.current);
    idleTimeout.current = setTimeout(() => {
      isInteracting.current = false;
      startAutoPlay();
    }, RESUME_DELAY_MS);
  }, [startAutoPlay]);

  useEffect(() => {
    startAutoPlay();
    return () => {
      pauseAutoPlay();
      stopAnimation();
    };
  }, [startAutoPlay, pauseAutoPlay, stopAnimation]);

  // Drag & Swipe gesture handlers
  const dragStartX = useRef<number | null>(null);
  const dragStartAngle = useRef(0);
  const dragMoved = useRef(false);

  const onDragStart = (clientX: number) => {
    isInteracting.current = true;
    pauseAutoPlay();
    stopAnimation();
    dragStartX.current = clientX;
    dragStartAngle.current = rotationRef.current;
    dragMoved.current = false;
  };

  const onDragMove = (clientX: number) => {
    if (dragStartX.current === null) return;
    const deltaX = clientX - dragStartX.current;
    if (Math.abs(deltaX) > 4) dragMoved.current = true;
    const newAngle = dragStartAngle.current + deltaX * 0.32;
    rotationRef.current = newAngle;
    setRotation(newAngle);
  };

  const onDragEnd = () => {
    if (dragStartX.current === null) return;
    dragStartX.current = null;

    // Snap to nearest 36 deg step
    const current = rotationRef.current;
    const snapAngle = Math.round(current / STEP_ANGLE) * STEP_ANGLE;

    animateToAngle(snapAngle, 280, () => {
      scheduleResume();
    });
  };

  const rotateCarousel = (direction: 'left' | 'right') => {
    isInteracting.current = true;
    pauseAutoPlay();
    const targetAngle =
      direction === 'left' ? rotationRef.current + STEP_ANGLE : rotationRef.current - STEP_ANGLE;
    animateToAngle(targetAngle, 320, () => {
      scheduleResume();
    });
  };

  const handleCardClick = (cardData: { styleItem: LookbookStyle; isFront: boolean; angleDeg: number }) => {
    if (dragMoved.current) return;
    if (cardData.isFront) {
      // Center card clicked -> open details
      setSelectedStyleForModal(cardData.styleItem);
      onSelectStyle?.(cardData.styleItem);
    } else {
      // Rotate card to front
      isInteracting.current = true;
      pauseAutoPlay();
      const stepDiff = Math.round(cardData.angleDeg / STEP_ANGLE);
      const targetAngle = rotationRef.current - stepDiff * STEP_ANGLE;
      animateToAngle(targetAngle, 340, () => {
        scheduleResume();
      });
    }
  };

  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Retracción 3D en profundidad cinemática (Zoom-out y desenfoque) hacia el fondo
  // cuando el carrusel se va ocultando para dar paso a Productos Destacados
  const stageScale = useTransform(scrollYProgress, [0, 0.60, 0.86], [1, 1, 0.78]);
  const stageY = useTransform(scrollYProgress, [0, 0.60, 0.86], [0, 0, -40]);
  const stageOpacity = useTransform(scrollYProgress, [0, 0.64, 0.86], [1, 1, 0]);
  const stageFilter = useTransform(scrollYProgress, [0, 0.64, 0.86], ['blur(0px)', 'blur(0px)', 'blur(8px)']);

  return (
    <div ref={sectionRef} className={cn("w-full my-auto py-16 sm:py-20 md:py-24 select-none overflow-hidden", className)}>
      <motion.div
        style={{
          scale: stageScale,
          y: stageY,
          opacity: stageOpacity,
          filter: stageFilter,
        }}
        className="max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 will-change-transform"
      >
        {/* Section Header */}
        <div className="text-center mb-6 sm:mb-8 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-widest mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Inspiración Alfa</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase">
            Cortes Reales
          </h2>
        </div>

        {/* 3D Dark Stage (Sin doble fondo) */}
        <div
          className="relative w-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing touch-pan-y"
          style={{ height: `${stageDimensions.stageHeight}px` }}
          onMouseDown={(e) => onDragStart(e.clientX)}
          onMouseMove={(e) => onDragMove(e.clientX)}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
          onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
          onTouchEnd={onDragEnd}
        >
          {/* Top Control Bar: Current Photo (Left), Indicator (Center), Total Photos (Right) */}
          <div className="absolute top-2 sm:top-4 left-4 sm:left-8 right-4 sm:right-8 flex items-center justify-between pointer-events-none z-30 select-none">
            {/* Left: Contador discreto de foto actual (ej. 1, 2, 3...) */}
            <div className="min-w-[28px] flex items-center justify-start">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 tracking-wider">
                {currentDisplayIndex}
              </span>
            </div>

            {/* Center: Minimalist Indicator (< • >) */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateCarousel('left');
                }}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Foto anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <div className="flex items-center justify-center w-5 h-5">
                <span
                  key={`${activeFaceIndex}-${activeStyle?.id}`}
                  className="w-2 h-2 rounded-full bg-blue-500 animate-dot-blink"
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateCarousel('right');
                }}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Foto siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            {/* Right: Total de fotos en la galería */}
            <div className="min-w-[28px] flex items-center justify-end">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 tracking-wider">
                {totalPhotos}
              </span>
            </div>
          </div>

          {/* Subtle Ambient Glow behind Center */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[500px] h-[300px] bg-blue-600/10 rounded-full blur-[100px] -z-10" />
          </div>

          {/* 3D Cylindrical Cards */}
          <div
            className="relative flex items-center justify-center"
            style={{
              perspective: '1200px',
              perspectiveOrigin: '50% 50%',
            }}
          >
            {SLOTS.map((offset) => {
              if (totalPhotos === 0) return null;
              const rawIdx = (currentCenterIndex + offset) % totalPhotos;
              const itemIndex = (rawIdx + totalPhotos) % totalPhotos;
              const styleItem = stylesList[itemIndex];
              if (!styleItem) return null;

              const angleDeg = (currentCenterIndex + offset - centerOffset) * STEP_ANGLE;
              const rad = angleDeg * DEG_TO_RAD;

              // Sin/Cos cylinder position
              const sinVal = Math.sin(rad);
              const cosVal = Math.cos(rad);

              const x = stageDimensions.radius * sinVal;
              const depth = (cosVal + 1) / 2; // 0 to 1
              const scale = 0.72 + 0.28 * depth;
              const opacity = 0.45 + 0.55 * depth;
              const zIndex = Math.round(depth * 30);
              const isFront = Math.abs(angleDeg) < STEP_ANGLE / 2;

              const cardData = { styleItem, isFront, angleDeg };

              return (
                <div
                  key={`slot_${offset}`}
                  onClick={() => handleCardClick(cardData)}
                  className="absolute cursor-pointer transition-transform duration-75 select-none"
                  style={{
                    width: `${stageDimensions.cardSize}px`,
                    height: `${stageDimensions.cardSize}px`,
                    transform: `translate3d(${x}px, 0px, 0px) scale(${scale})`,
                    zIndex,
                    opacity,
                  }}
                >
                  <div
                    className={cn(
                      "w-full h-full rounded-2xl overflow-hidden bg-slate-900 border transition-all duration-300 relative group",
                      isFront
                        ? "border-2 border-blue-500 shadow-[0_0_35px_rgba(59,130,246,0.55)] ring-1 ring-blue-400/40"
                        : "border-slate-700/80 shadow-md hover:border-blue-400/60"
                    )}
                  >
                    <Image
                      src={styleItem.imagenUrl}
                      alt={styleItem.titulo || 'Corte Alfa'}
                      fill
                      quality={85}
                      sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, (max-width: 1440px) 260px, 320px"
                      className="object-cover pointer-events-none"
                      draggable={false}
                      unoptimized={true}
                    />

                    {/* Indicador de visualización: Icono de ojo limpio al centro en la parte inferior */}
                    <div
                      className="absolute inset-x-0 bottom-0 pt-8 pb-3 flex items-center justify-center bg-gradient-to-t from-black/70 via-black/25 to-transparent cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStyleForModal(styleItem);
                        onSelectStyle?.(styleItem);
                      }}
                      title="Ver fotografía del corte"
                    >
                      <Eye
                        className={cn(
                          "w-5 h-5 transition-all duration-300 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]",
                          isFront
                            ? "text-blue-400 scale-110"
                            : "text-slate-300/80 group-hover:text-white group-hover:scale-105"
                        )}
                        strokeWidth={2}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Lookbook Style Detail Modal (Estilo App Móvil: Solo imagen, destello dorado mate, X arriba derecha y botón agendar) */}
      <Dialog
        open={!!selectedStyleForModal}
        onOpenChange={(open) => !open && setSelectedStyleForModal(null)}
      >
        <DialogContent
          hideCloseButton={true}
          className="w-[calc(100%-2.5rem)] sm:w-full max-w-lg bg-transparent border-none shadow-none p-0 overflow-visible flex flex-col justify-center items-center max-h-[90vh] z-50 gap-0"
        >
          {/* Resplandor de Luz Dorada Mate (Puro destello de luz, sin marco perimetral) */}
          <AlfaGoldSmokeBurst key={selectedStyleForModal?.id || 'lookbook_smoke'} />

          {/* Contenedor Oficial del Modal */}
          <div className="relative z-10 w-full bg-white rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border-2 border-blue-500 flex flex-col max-h-[90vh]">
            {/* Cabecera Oficial VATOS ALFA con haz de luz: Sin textos, solo la X en la parte superior derecha */}
            <div className="p-3 sm:p-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-end border-b border-[#2d3a60]/60 relative overflow-hidden shrink-0">
              <div className="header-light-beam" aria-hidden="true" />
              <div className="relative z-10 flex items-center justify-end w-full">
                <DialogTitle className="sr-only">
                  {selectedStyleForModal?.titulo || 'Corte Real'}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Visualización de corte real
                </DialogDescription>
                <button
                  type="button"
                  onClick={() => setSelectedStyleForModal(null)}
                  className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10"
                  aria-label="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Únicamente la fotografía del corte en alta calidad */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col items-center justify-center">
              <div className="relative aspect-square w-full max-w-md rounded-xl overflow-hidden bg-slate-900 border border-border/60 shadow-md">
                {selectedStyleForModal?.imagenUrl && (
                  <Image
                    src={selectedStyleForModal.imagenUrl}
                    alt={selectedStyleForModal.titulo || 'Corte Real'}
                    fill
                    quality={95}
                    className="object-cover"
                    unoptimized={true}
                  />
                )}
              </div>
            </div>

            {/* Footer: Únicamente el botón de agendar */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-border/40 flex justify-center">
              <Button
                variant="alfa"
                className="w-full max-w-xs rounded-xl h-11 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer"
                onClick={() => {
                  const s = selectedStyleForModal;
                  setSelectedStyleForModal(null);
                  if (onBookStyle && s) {
                    onBookStyle(s);
                  }
                }}
              >
                <Scissors className="w-4 h-4 text-slate-300" />
                <span>Agendar este Estilo</span>
                <ArrowRight className="w-4 h-4 text-slate-300" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
