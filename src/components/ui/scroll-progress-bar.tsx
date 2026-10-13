'use client';

import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 300,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2.5px] pointer-events-none bg-transparent">
      {/* Laser Glow Track (Azul Vatos Alfa puro) */}
      <motion.div
        className="relative h-full bg-gradient-to-r from-[#1e3a8a] via-[#3b82f6] to-[#93c5fd] origin-left"
        style={{
          scaleX,
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.9), 0 0 20px rgba(96, 165, 250, 0.7)',
        }}
      >
        {/* Leading Edge Luminous Core */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-[5px] bg-white rounded-full blur-[1px] shadow-[0_0_8px_#ffffff]" />
      </motion.div>
    </div>
  );
}
