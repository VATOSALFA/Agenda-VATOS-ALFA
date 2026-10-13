'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';

export function AlfaHeroBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Física de resortes optimizada para sincronizar el fondo con el texto del Hero
  // y eliminar tirones/brincos causados por el scroll táctil en dispositivos móviles
  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 32,
    mass: 0.15,
    restDelta: 0.001,
  });

  // Traslaciones por GPU en píxeles fijos en lugar de porcentajes para evitar layout recalculations
  const ySpotlight = useTransform(smoothScroll, [0, 1], [0, 130]);
  const yGrid = useTransform(smoothScroll, [0, 1], [0, 85]);
  const yWatermark = useTransform(smoothScroll, [0, 1], [-30, 45]);
  const scaleWatermark = useTransform(smoothScroll, [0, 1], [1, 1.25]);
  const opacityWatermark = useTransform(smoothScroll, [0, 0.70], [0.11, 0]);
  const yBeams = useTransform(smoothScroll, [0, 1], [0, 140]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* 1. Base Gradient: Deep Midnight Navy */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#060a14] via-[#0b1328] to-[#070b16]" />

      {/* 2. Central Ice-Blue Spotlight Glow with Parallax (Blur optimizado para GPU de móviles) */}
      <motion.div 
        style={{ 
          y: ySpotlight,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[450px] sm:h-[650px] rounded-full blur-[60px] sm:blur-[120px] opacity-40 will-change-transform"
      >
        <div
          className="w-full h-full"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.45) 0%, rgba(30, 58, 138, 0.25) 45%, transparent 70%)',
          }}
        />
      </motion.div>

      {/* 3. Subtle Secondary Top Glow (Navy Alfa) */}
      <div 
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full blur-[60px] sm:blur-[100px] opacity-35"
        style={{
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.3) 0%, transparent 70%)',
        }}
      />

      {/* 4. Precision Geometric Grid Mesh with Parallax */}
      <motion.div 
        style={{ 
          y: yGrid,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
        }}
        className="absolute inset-0 opacity-[0.14] will-change-transform"
      >
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(59, 130, 246, 0.4) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59, 130, 246, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 80%)',
          }}
        />
      </motion.div>

      {/* 5. Monumental 'V' Watermark in the background with Scale & Parallax */}
      <motion.div 
        style={{ 
          y: yWatermark,
          scale: scaleWatermark,
          opacity: opacityWatermark,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          maskImage: 'radial-gradient(ellipse at center, black 45%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 45%, transparent 75%)',
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[340px] sm:w-[580px] h-[340px] sm:h-[580px] mix-blend-screen pointer-events-none will-change-transform"
      >
        <Image
          src="/logo-v-400x400.webp"
          alt="Vatos Alfa Mark"
          fill
          priority
          className="object-contain filter grayscale contrast-200"
          unoptimized={true}
        />
      </motion.div>

      {/* 6. Diagonal Laser Beams with Scroll Offset (Azul Institucional Vatos Alfa puro) */}
      <motion.div 
        style={{ 
          y: yBeams,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
        }} 
        className="absolute inset-0 overflow-hidden will-change-transform"
      >
        {/* Beam 1 - Main Oblique Beam (Azul Acento Alfa #3B82F6) */}
        <div 
          className="absolute -inset-x-full top-0 h-[2px] bg-gradient-to-r from-transparent via-[#3B82F6] to-transparent opacity-45 blur-[1px] transform -rotate-[22deg]"
          style={{
            animation: 'alfaLaserBeam 7s ease-in-out infinite',
          }}
        />

        {/* Beam 2 - Soft Secondary Ice-Blue Beam (#60A5FA / Azul Claro Vatos Alfa) */}
        <div 
          className="absolute -inset-x-full top-1/3 h-[1.5px] bg-gradient-to-r from-transparent via-[#60A5FA] to-transparent opacity-30 blur-[1.5px] transform -rotate-[22deg]"
          style={{
            animation: 'alfaLaserBeam 11s ease-in-out infinite 3.5s',
          }}
        />

        {/* Ambient Light Cone across the hero */}
        <div 
          className="absolute inset-0 opacity-15"
          style={{
            background: 'linear-gradient(115deg, transparent 35%, rgba(59, 130, 246, 0.15) 50%, transparent 65%)',
          }}
        />
      </motion.div>

      {/* 7. Bottom Gradient Fade: Eliminates harsh cut between hero and next section */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />

      {/* Inline styles for beam keyframe animation */}
      <style jsx>{`
        @keyframes alfaLaserBeam {
          0% {
            transform: translateY(-80px) rotate(-22deg);
            opacity: 0;
          }
          20% {
            opacity: 0.45;
          }
          80% {
            opacity: 0.35;
          }
          100% {
            transform: translateY(600px) rotate(-22deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
