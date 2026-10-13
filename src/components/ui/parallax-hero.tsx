'use client';

import React, { useEffect, useRef } from 'react';

interface ParallaxPageProps {
  children: React.ReactNode;
}

export function ParallaxHero({ children }: ParallaxPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lenis: any;
    let rafId: number;

    const initSmoothScroll = async () => {
      // Enable smooth inertial scrolling on desktop / non-touch screens
      if (typeof window !== 'undefined' && window.innerWidth > 768) {
        try {
          const lenisModule = await import('@studio-freight/lenis');
          const Lenis = lenisModule.default || lenisModule;

          lenis = new Lenis({
            duration: 1.15,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 0.95,
            touchMultiplier: 1.5,
          });

          (window as any).__lenis = lenis;

          const raf = (time: number) => {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
          };

          rafId = requestAnimationFrame(raf);
        } catch (e) {
          console.warn('Lenis could not be initialized:', e);
        }
      }
    };

    initSmoothScroll();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (lenis) {
        lenis.destroy();
        delete (window as any).__lenis;
      }
    };
  }, []);

  return (
    <div ref={containerRef}>
      {children}
    </div>
  );
}
