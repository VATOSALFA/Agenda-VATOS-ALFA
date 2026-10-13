'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function VerticalSectionNavigator() {
  const [canScrollUp, setCanScrollUp] = useState(false);

  // Monitor de scroll pasivo: solo aparece cuando el usuario ha avanzado en la página
  useEffect(() => {
    const handleScroll = () => {
      // Aparece suavemente tras superar los 250px de scroll (fuera del Hero)
      setCanScrollUp(window.scrollY > 250);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Navegar suavemente al inicio absoluto de la página
  const handleScrollTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, []);

  return (
    <aside
      aria-label="Volver arriba"
      className="hidden md:flex fixed right-3 lg:right-5 top-1/2 -translate-y-1/2 z-40 select-none pointer-events-auto"
    >
      {/* Botón Subir al Inicio (Bare icon limpio, sin contenedor ni cajas con fondo) */}
      <button
        type="button"
        onClick={handleScrollTop}
        aria-label="Ir al inicio de la página"
        title="Ir al inicio"
        className={cn(
          "p-1.5 text-slate-500 hover:text-blue-600 transition-all duration-300 transform hover:scale-125 active:scale-95 cursor-pointer filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]",
          canScrollUp
            ? "opacity-100 translate-y-0"
            : "opacity-0 pointer-events-none -translate-y-2"
        )}
      >
        <ChevronUp className="w-6 h-6" strokeWidth={2.4} />
      </button>
    </aside>
  );
}

// Alias de exportación para flexibilidad semántica
export const ScrollToTopButton = VerticalSectionNavigator;
