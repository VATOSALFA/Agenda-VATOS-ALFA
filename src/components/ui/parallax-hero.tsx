'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from '@studio-freight/lenis';

interface ParallaxPageProps {
  children: React.ReactNode;
}

export function ParallaxHero({ children }: ParallaxPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const container = containerRef.current;
    if (!container) return;

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

    // Smooth scroll with Lenis
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    return () => {
      ScrollTrigger.getAll().forEach(st => st.kill());
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={containerRef}>
      {children}
    </div>
  );
}
