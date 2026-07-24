'use client';

import React, { useEffect, useRef } from 'react';

interface ParallaxPageProps {
  children: React.ReactNode;
}

export function ParallaxHero({ children }: ParallaxPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lenis: any;
    let stCleanup: (() => void) | undefined;

    const initParallax = async () => {
      const container = containerRef.current;
      if (!container) return;

      const [gsapModule, scrollTriggerModule, lenisModule] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('@studio-freight/lenis')
      ]);

      const gsap = gsapModule.default || gsapModule;
      const ScrollTrigger = scrollTriggerModule.ScrollTrigger || scrollTriggerModule.default;
      const Lenis = lenisModule.default || lenisModule;

      gsap.registerPlugin(ScrollTrigger);

      // Hero background parallax — aurora moves slower than scroll
      const triggerElement = container.querySelector('[data-parallax-layers]');
      if (triggerElement) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: triggerElement,
            start: "0% 0%",
            end: "100% 0%",
            scrub: 0,
          }
        });
        tl.to(triggerElement.querySelectorAll('[data-parallax-layer="1"]'), { yPercent: 70, ease: "none" });
        tl.to(triggerElement.querySelectorAll('[data-parallax-layer="2"]'), { yPercent: 55, ease: "none" }, "<");
      }

      // Smooth scroll with Lenis - Only on Desktop
      if (window.innerWidth > 768) {
        lenis = new Lenis({
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          wheelMultiplier: 1,
        });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time: number) => { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      }

      stCleanup = () => {
        ScrollTrigger.getAll().forEach(st => st.kill());
      };
    };

    initParallax();

    return () => {
      if (stCleanup) stCleanup();
      if (lenis) lenis.destroy();
    };
  }, []);

  return (
    <div ref={containerRef}>
      {children}
    </div>
  );
}
