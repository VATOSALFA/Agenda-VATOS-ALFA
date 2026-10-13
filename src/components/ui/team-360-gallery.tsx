'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Sparkles, Calendar, ArrowRight, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BarberItem {
  id: string;
  name: string;
  publicName?: string;
  avatarUrl?: string;
  bio?: string;
  rating?: number;
  specialties?: string[];
  [key: string]: any;
}

interface Team360GalleryProps {
  barbers: BarberItem[];
  onSelectBarber?: (barber: BarberItem) => void;
  onBookBarber?: (barber: BarberItem) => void;
  branchName?: string;
  companyName?: string;
  className?: string;
}

const AUTOPLAY_INTERVAL_MS = 3500;
const RESUME_DELAY_MS = 4500;
const MAX_TILT_DEG = 26;
const DEG_TO_RAD = Math.PI / 180;

export function Team360Gallery({
  barbers,
  onSelectBarber,
  onBookBarber,
  branchName,
  companyName,
  className,
}: Team360GalleryProps) {
  // Balanced slots: minimum 6, or 10 if 5 barbers (matching mobile app 10-face orbit)
  const slots: BarberItem[] = useMemo(() => {
    if (!barbers || barbers.length === 0) return [];
    if (barbers.length === 1) return Array(6).fill(barbers[0]);
    if (barbers.length === 2) return [...barbers, ...barbers, ...barbers];
    if (barbers.length === 3) return [...barbers, ...barbers];
    if (barbers.length === 4) return [...barbers, ...barbers];
    if (barbers.length === 5) return [...barbers, ...barbers]; // 10 slots
    return barbers;
  }, [barbers]);

  const numSlots = slots.length;
  const angleStep = numSlots > 0 ? 360 / numSlots : 60;

  // Selected slot index
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const selectedSlotIndexRef = useRef(0);
  selectedSlotIndexRef.current = selectedSlotIndex;

  const activeBarber = slots[selectedSlotIndex] || barbers[0];

  // Rotation state & refs
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Center card transition
  const [centerScale, setCenterScale] = useState(1);
  const [centerOpacity, setCenterOpacity] = useState(1);

  // Responsive dimensions scaled up for desktop and large screens
  const [dimensions, setDimensions] = useState({
    centerWidth: 320,
    centerHeight: 370,
    thumbSize: 170,
    radiusX: 380,
    radiusY: 18,
    stageHeight: 410,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const w = window.innerWidth;
      if (w < 640) {
        // Mobile: Ajuste calibrado para que las tarjetas laterales no se desborden ni se corten
        const cWidth = Math.round(Math.min(190, w * 0.48));
        const tSize = Math.round(cWidth * 0.45);
        const maxReach = tSize * 0.65;
        const safeMargin = 14;
        const maxAllowedRadius = Math.max(75, Math.floor((w / 2) - maxReach - safeMargin));
        const radX = Math.min(Math.round(w * 0.31), maxAllowedRadius);

        setDimensions({
          centerWidth: cWidth,
          centerHeight: Math.round(cWidth * 1.16),
          thumbSize: tSize,
          radiusX: radX,
          radiusY: 10,
          stageHeight: 270,
        });
      } else if (w < 1024) {
        // Tablet
        setDimensions({
          centerWidth: 260,
          centerHeight: 300,
          thumbSize: 145,
          radiusX: 270,
          radiusY: 14,
          stageHeight: 330,
        });
      } else if (w < 1440) {
        // Desktop standard (1024px - 1439px)
        setDimensions({
          centerWidth: 320,
          centerHeight: 370,
          thumbSize: 170,
          radiusX: 380,
          radiusY: 18,
          stageHeight: 410,
        });
      } else {
        // Widescreen / 2K+ (>= 1440px)
        setDimensions({
          centerWidth: 380,
          centerHeight: 440,
          thumbSize: 200,
          radiusX: 470,
          radiusY: 22,
          stageHeight: 480,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Smooth animation to target angle
  const animateToAngle = useCallback(
    (targetAngle: number, duration = 320, onComplete?: () => void) => {
      stopAnimation();
      const start = rotationRef.current;
      const diff = targetAngle - start;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const t = Math.min(1, elapsed / duration);
        // Cubic ease-out
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

  // Transitions for center hero card
  const hideCenter = useCallback((onDone?: () => void) => {
    setCenterOpacity(0);
    setCenterScale(0.94);
    setTimeout(() => {
      onDone?.();
    }, 90);
  }, []);

  const revealCenter = useCallback(() => {
    setCenterOpacity(1);
    setCenterScale(1);
  }, []);

  // Autoplay management
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null);
  const idleTimeout = useRef<NodeJS.Timeout | null>(null);
  const isInteracting = useRef(false);

  const startAutoPlay = useCallback(() => {
    if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
    if (numSlots <= 1) return;

    autoPlayTimer.current = setInterval(() => {
      if (!isInteracting.current) {
        const nextIndex = (selectedSlotIndexRef.current + 1) % numSlots;
        const targetAngle = rotationRef.current - angleStep;

        hideCenter(() => {
          animateToAngle(targetAngle, 340, () => {
            setSelectedSlotIndex(nextIndex);
            revealCenter();
          });
        });
      }
    }, AUTOPLAY_INTERVAL_MS);
  }, [numSlots, angleStep, animateToAngle, hideCenter, revealCenter]);

  const pauseAutoPlay = useCallback(() => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
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
      if (idleTimeout.current) clearTimeout(idleTimeout.current);
    };
  }, [startAutoPlay, pauseAutoPlay, stopAnimation]);

  // Rotate by direction (Left or Right arrow buttons)
  const rotateCarousel = useCallback(
    (direction: 'left' | 'right') => {
      isInteracting.current = true;
      pauseAutoPlay();
      stopAnimation();

      const nextIndex =
        direction === 'left'
          ? (selectedSlotIndexRef.current - 1 + numSlots) % numSlots
          : (selectedSlotIndexRef.current + 1) % numSlots;

      const delta = direction === 'left' ? angleStep : -angleStep;
      const targetAngle = rotationRef.current + delta;

      hideCenter(() => {
        animateToAngle(targetAngle, 280, () => {
          setSelectedSlotIndex(nextIndex);
          revealCenter();
          scheduleResume();
        });
      });
    },
    [angleStep, animateToAngle, hideCenter, numSlots, pauseAutoPlay, revealCenter, scheduleResume, stopAnimation]
  );

  // Click on a thumb to center it
  const handleThumbClick = useCallback(
    (index: number) => {
      if (index === selectedSlotIndexRef.current) {
        if (activeBarber && onSelectBarber) onSelectBarber(activeBarber);
        return;
      }

      isInteracting.current = true;
      pauseAutoPlay();
      stopAnimation();

      const baseAngle = index * angleStep;
      const currentNormalized = ((rotationRef.current % 360) + 360) % 360;
      let diff = -baseAngle - currentNormalized;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      const target = rotationRef.current + diff;

      hideCenter(() => {
        animateToAngle(target, 300, () => {
          setSelectedSlotIndex(index);
          revealCenter();
          scheduleResume();
        });
      });
    },
    [activeBarber, angleStep, animateToAngle, hideCenter, onSelectBarber, pauseAutoPlay, revealCenter, scheduleResume, stopAnimation]
  );

  // Drag & Swipe handlers (Mouse & Touch)
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartAngle = useRef(0);

  const onDragStart = (clientX: number) => {
    isInteracting.current = true;
    isDragging.current = true;
    pauseAutoPlay();
    stopAnimation();
    dragStartX.current = clientX;
    dragStartAngle.current = rotationRef.current;
  };

  const onDragMove = (clientX: number) => {
    if (!isDragging.current) return;
    const deltaX = clientX - dragStartX.current;
    const deltaAngle = deltaX * 0.35; // Sensitivity factor
    const newAngle = dragStartAngle.current + deltaAngle;
    rotationRef.current = newAngle;
    setRotation(newAngle);
  };

  const onDragEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // Snap to nearest slot
    const currentRot = rotationRef.current;
    const normalized = -currentRot;
    let closestIndex = Math.round(normalized / angleStep) % numSlots;
    if (closestIndex < 0) closestIndex += numSlots;

    const snapAngle = -Math.round(normalized / angleStep) * angleStep;

    hideCenter(() => {
      animateToAngle(snapAngle, 260, () => {
        setSelectedSlotIndex(closestIndex);
        revealCenter();
        scheduleResume();
      });
    });
  };

  if (!barbers || barbers.length === 0) {
    return null;
  }

  const activeName = activeBarber?.publicName || activeBarber?.name || 'Especialista';
  const firstName = activeName.split(' ')[0];

  return (
    <div className={cn("w-full py-4 md:py-8 select-none overflow-hidden", className)}>
      <div className="max-w-5xl xl:max-w-6xl mx-auto px-2 sm:px-4">
        {/* 3D Orbit Carousel Stage */}
        <div
          className="relative w-full flex items-center justify-center cursor-grab active:cursor-grabbing touch-pan-y"
          style={{ height: `${dimensions.stageHeight}px` }}
          onMouseDown={(e) => onDragStart(e.clientX)}
          onMouseMove={(e) => onDragMove(e.clientX)}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
          onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
          onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
          onTouchEnd={onDragEnd}
        >
          {/* Orbiting Side Cards */}
          {slots.map((barber, index) => {
            const baseAngle = index * angleStep;
            const totalAngle = rotation + baseAngle;
            const rad = totalAngle * DEG_TO_RAD;
            const sinVal = Math.sin(rad);
            const cosVal = Math.cos(rad);

            const x = dimensions.radiusX * sinVal;
            const y = dimensions.radiusY * cosVal;

            const tiltDeg = sinVal * MAX_TILT_DEG;
            const depth = (cosVal + 1) / 2;
            const scale = 0.78 + 0.22 * depth;
            const opacity = 0.72 + 0.28 * depth;
            const zIndex = Math.round(depth * 10);

            const isCurrentCenter = index === selectedSlotIndex;

            return (
              <div
                key={`thumb_${barber.id}_${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleThumbClick(index);
                }}
                className={cn(
                  "absolute transition-opacity duration-200 cursor-pointer",
                  isCurrentCenter && "pointer-events-none opacity-0"
                )}
                style={{
                  width: `${dimensions.thumbSize}px`,
                  height: `${dimensions.thumbSize}px`,
                  transform: `translate3d(${x}px, ${y}px, 0px) rotate(${tiltDeg}deg) scale(${scale})`,
                  opacity: isCurrentCenter ? 0 : opacity,
                  zIndex,
                }}
              >
                <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/80 shadow-[0_8px_20px_rgba(0,0,0,0.35)] relative group hover:border-blue-400 transition-colors">
                  {barber.avatarUrl ? (
                    <Image
                      src={barber.avatarUrl}
                      alt={`${barber.publicName || barber.name || 'Barbero'} - Barbero Profesional en ${companyName || 'VATOS ALFA Barber Shop'} ${branchName || 'Querétaro'}`}
                      fill
                      quality={75}
                      sizes="160px"
                      className="object-cover"
                      draggable={false}
                      unoptimized={true}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">
                      <User className="w-8 h-8 text-slate-500" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Central Hero Card */}
          <div
            className="absolute z-20 flex items-center justify-center transition-all duration-300 ease-out"
            style={{
              width: `${dimensions.centerWidth}px`,
              height: `${dimensions.centerHeight}px`,
              opacity: centerOpacity,
              transform: `scale(${centerScale})`,
            }}
          >
            <div
              onClick={() => onSelectBarber?.(activeBarber)}
              className="w-full h-full rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-700/70 shadow-[0_20px_45px_rgba(15,23,42,0.45)] relative group cursor-pointer hover:border-blue-500 transition-colors"
            >
              {activeBarber?.avatarUrl ? (
                <Image
                  src={activeBarber.avatarUrl}
                  alt={`${activeName} - Especialista en Barbería y Cuidado Masculino en ${companyName || 'VATOS ALFA Barber Shop'} ${branchName || 'Querétaro'}`}
                  fill
                  quality={85}
                  priority
                  sizes="300px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  draggable={false}
                  unoptimized={true}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-2">
                  <User className="w-14 h-14 text-slate-400" />
                  <span className="text-sm font-bold">{activeName}</span>
                </div>
              )}

              {/* Bottom Gradient Overlay con Nombre del Barbero */}
              <div className="absolute inset-x-0 bottom-0 pt-10 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex items-center justify-center">
                <span className="text-white text-sm sm:text-base font-black tracking-wide text-center drop-shadow-md truncate">
                  {activeName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Minimalist Indicator (< • >) */}
        <div className="flex items-center justify-center gap-4 mt-3 mb-6">
          <button
            onClick={() => rotateCarousel('left')}
            className="p-1 text-slate-400 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Anterior barbero"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Single Center Indicator Dot that blinks on image change */}
          <div className="flex items-center justify-center w-6 h-6">
            <span
              key={`${selectedSlotIndex}-${activeBarber?.id}`}
              className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-dot-blink"
            />
          </div>

          <button
            onClick={() => rotateCarousel('right')}
            className="p-1 text-slate-400 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Siguiente barbero"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* CTA Button: Agendar con Barbero */}
        <div className="flex items-center justify-center">
          <Button
            variant="alfa"
            size="lg"
            className="w-full sm:w-auto min-w-[260px] max-w-sm rounded-2xl h-12 text-sm sm:text-base font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            onClick={() => {
              if (onBookBarber && activeBarber) {
                onBookBarber(activeBarber);
              } else if (onSelectBarber && activeBarber) {
                onSelectBarber(activeBarber);
              }
            }}
          >
            <Calendar className="w-4 h-4 text-slate-300" />
            <span>Agendar con {firstName}</span>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </Button>
        </div>
      </div>
    </div>
  );
}
