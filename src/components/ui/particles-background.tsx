'use client';

import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  left: number;
  duration: number;
  delay: number;
  size: number;
  opacity: number;
}

export const ParticlesBackground = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Option 1 Logic: Rising Lights with blue glow
    const count = 100;
    const newParticles = Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: Math.random() * 15 + 10,
      delay: Math.random() * 20,
      size: Math.random() * 6 + 3,
      opacity: Math.random() * 0.5 + 0.4, // Increased opacity for brightness
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: '100%',
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: 'hsl(var(--primary))',
            opacity: p.opacity,
            animation: `floatUp ${p.duration}s linear infinite`,
            animationDelay: `-${p.delay}s`,
            // Smaller glow (reduced blur/spread) but brighter (higher opacity)
            boxShadow: `0 0 ${p.size}px 1px hsl(var(--primary) / 0.8)`,
            filter: 'blur(0.5px)',
          }}
        />
      ))}
      <style jsx>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) translateX(0) scale(0);
            opacity: 0;
          }
          10% {
             opacity: var(--opacity, 1);
             transform: translateY(-10vh) translateX(${Math.random() * 20 - 10}px) scale(1);
          }
          50% {
             transform: translateY(-50vh) translateX(${Math.random() * 40 - 20}px) scale(1);
          }
          100% {
            transform: translateY(-120vh) translateX(${Math.random() * 60 - 30}px) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
