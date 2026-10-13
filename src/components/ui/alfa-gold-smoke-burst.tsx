'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface AlfaGoldSmokeBurstProps {
  className?: string;
}

// 8 nubes volumétricas de humo dorado mate que salen disparadas orgánicamente desde atrás del modal en 360°
// Adaptadas tanto a escritorio (tx, ty) como a celulares (txM, tyM), sin ningún marco perimetral ni líneas sólidas
const SMOKE_PUFFS = [
  // Arriba
  { id: 1, tx: '0px', ty: '-270px', txM: '0px', tyM: '-340px', rot: '12deg', borderRadius: '56% 44% 58% 42% / 44% 56% 42% 58%' },
  // Arriba-Derecha
  { id: 2, tx: '310px', ty: '-220px', txM: '150px', tyM: '-290px', rot: '-20deg', borderRadius: '48% 52% 44% 56% / 54% 46% 54% 46%' },
  // Derecha
  { id: 3, tx: '380px', ty: '0px', txM: '175px', tyM: '-30px', rot: '15deg', borderRadius: '58% 42% 62% 38% / 42% 58% 38% 62%' },
  // Abajo-Derecha
  { id: 4, tx: '310px', ty: '220px', txM: '150px', tyM: '290px', rot: '-18deg', borderRadius: '46% 54% 50% 50% / 50% 50% 50% 50%' },
  // Abajo
  { id: 5, tx: '0px', ty: '270px', txM: '0px', tyM: '340px', rot: '15deg', borderRadius: '52% 48% 44% 56% / 56% 44% 56% 44%' },
  // Abajo-Izquierda
  { id: 6, tx: '-310px', ty: '220px', txM: '-150px', tyM: '290px', rot: '-22deg', borderRadius: '44% 56% 52% 48% / 56% 44% 48% 52%' },
  // Izquierda
  { id: 7, tx: '-380px', ty: '0px', txM: '-175px', tyM: '-30px', rot: '18deg', borderRadius: '50% 50% 46% 54% / 54% 46% 54% 46%' },
  // Arriba-Izquierda
  { id: 8, tx: '-310px', ty: '-220px', txM: '-150px', tyM: '-290px', rot: '-15deg', borderRadius: '56% 44% 54% 46% / 46% 54% 46% 54%' },
];

export function AlfaGoldSmokeBurst({ className }: AlfaGoldSmokeBurstProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none overflow-visible",
        className
      )}
      aria-hidden="true"
    >
      {/* 1. Resplandor suave de luz dorada mate (difuso, circular/elíptico orgánico, CERO marcos o líneas sólidas) */}
      <div
        className="absolute w-[360px] h-[480px] sm:w-[650px] sm:h-[500px] rounded-full animate-gold-glow-burst pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(235, 218, 185, 0.78) 0%, rgba(197, 168, 128, 0.45) 40%, rgba(160, 130, 90, 0.15) 65%, transparent 80%)',
          filter: 'blur(35px)',
        }}
      />

      {/* 2. Cuatro destellos suaves de haz de luz dorada en las esquinas */}
      <div
        className="absolute w-2 h-44 sm:h-56 bg-gradient-to-t from-transparent via-[#ebdab9]/70 to-transparent animate-gold-ray"
        style={{ '--angle': '45deg', filter: 'blur(5px)' } as React.CSSProperties}
      />
      <div
        className="absolute w-2 h-44 sm:h-56 bg-gradient-to-t from-transparent via-[#ebdab9]/70 to-transparent animate-gold-ray"
        style={{ '--angle': '-45deg', filter: 'blur(5px)' } as React.CSSProperties}
      />
      <div
        className="absolute w-2 h-44 sm:h-56 bg-gradient-to-t from-transparent via-[#c5a880]/70 to-transparent animate-gold-ray"
        style={{ '--angle': '135deg', filter: 'blur(5px)' } as React.CSSProperties}
      />
      <div
        className="absolute w-2 h-44 sm:h-56 bg-gradient-to-t from-transparent via-[#c5a880]/70 to-transparent animate-gold-ray"
        style={{ '--angle': '-135deg', filter: 'blur(5px)' } as React.CSSProperties}
      />

      {/* 3. Nubes volumétricas de humo que se disparan en 360° desde atrás del modal */}
      {SMOKE_PUFFS.map((puff) => (
        <div
          key={puff.id}
          className="absolute w-[220px] h-[200px] sm:w-[320px] sm:h-[280px] animate-smoke-puff"
          style={
            {
              '--tx': puff.tx,
              '--ty': puff.ty,
              '--tx-m': puff.txM,
              '--ty-m': puff.tyM,
              '--rot': puff.rot,
              borderRadius: puff.borderRadius,
              background: 'radial-gradient(circle, rgba(238, 222, 195, 0.78) 0%, rgba(197, 168, 128, 0.48) 45%, rgba(162, 133, 94, 0.18) 70%, transparent 88%)',
              filter: 'blur(22px)',
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
