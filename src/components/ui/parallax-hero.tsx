'use client';

import React, { useEffect, useRef } from 'react';

interface ParallaxPageProps {
  children: React.ReactNode;
}

export function ParallaxHero({ children }: ParallaxPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lenis: any;
    let rafId: number | undefined;
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    const initSmoothScroll = async () => {
      // Enable smooth inertial scrolling on desktop / non-touch screens
      if (isCancelled || typeof window === 'undefined' || window.innerWidth <= 768) return;
      try {
        const lenisModule = await import('@studio-freight/lenis');
        if (isCancelled) return;
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
          if (isCancelled) return;
          lenis.raf(time);
          rafId = requestAnimationFrame(raf);
        };

        rafId = requestAnimationFrame(raf);
      } catch (e) {
        console.warn('Lenis could not be initialized:', e);
      }
    };

    if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
      idleId = (window as any).requestIdleCallback(() => {
        initSmoothScroll();
      }, { timeout: 1000 });
    } else {
      timerId = setTimeout(initSmoothScroll, 300);
    }

    return () => {
      isCancelled = true;
      if (idleId !== undefined && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) clearTimeout(timerId);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
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
