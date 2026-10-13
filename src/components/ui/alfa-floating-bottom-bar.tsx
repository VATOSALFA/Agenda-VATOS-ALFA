'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, MessageSquare, Calendar, ArrowRight } from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';

interface AlfaFloatingBottomBarProps {
  totalItems: number;
  totalPrice: number;
  formatPrice: (price: number) => string;
  isBooking: boolean;
  hasServiceInCart: boolean;
  onBookingClick: () => void;
  onConfirmCartClick: () => void;
  onOpenJanetChat: () => void;
  branchName?: string;
  branchAddress?: string;
  companyName?: string;
}

export function AlfaFloatingBottomBar({
  totalItems,
  totalPrice,
  formatPrice,
  isBooking,
  hasServiceInCart,
  onBookingClick,
  onConfirmCartClick,
  onOpenJanetChat,
  branchName = 'Sucursal Sombrerete',
  branchAddress = 'Av. Sombrerete 1001, Col. Cipreses, Querétaro',
  companyName = 'VATOS ALFA Barber Shop',
}: AlfaFloatingBottomBarProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Mostrar al hacer scroll de más de 320px o si hay items en el carrito
      const shouldShow = window.scrollY > 320 || totalItems > 0;
      setIsVisible(shouldShow);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [totalItems]);

  const mapsQuery = encodeURIComponent(`${companyName} ${branchName} ${branchAddress}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const handleOpenMaps = () => {
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside
      aria-label="Barra de acciones rápidas y reserva"
      className={`fixed bottom-0 left-0 w-screen max-w-[100vw] h-16 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-t border-[#2d3a60]/60 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.5)] backdrop-blur-md z-[100] flex items-center justify-center px-4 pb-safe transition-all duration-300 ease-out ${
        isVisible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      {/* Haz de luz oblicuo animado idéntico a la franja azul de la agenda */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="header-light-beam" />
      </div>

      {/* Contenedor de los 3 botones circulares oficiales centrados y juntos */}
      <div className="relative z-10 flex items-center justify-center gap-3.5 sm:gap-4">
        {/* BOTÓN 1: Google Maps ("Cómo Llegar") */}
        <Button
          type="button"
          variant="alfa"
          size="icon"
          onClick={handleOpenMaps}
          className="w-12 h-12 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_12px_rgba(59,130,246,0.3)] cursor-pointer shrink-0"
          title="Cómo llegar (Google Maps)"
          aria-label="Cómo llegar en Google Maps"
        >
          <MapPin className="h-5 w-5 text-white" />
        </Button>

        {/* BOTÓN 2: Janet / Recepción ("Mensajes") */}
        <div className="relative shrink-0">
          <Button
            type="button"
            variant="alfa"
            size="icon"
            onClick={onOpenJanetChat}
            className="w-12 h-12 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_12px_rgba(59,130,246,0.3)] cursor-pointer"
            title="Plática en vivo con Janet y Recepción"
            aria-label="Chat con Janet y Recepción"
          >
            <MessageSquare className="h-5 w-5 text-white" />
          </Button>

          {/* Pulso de En línea */}
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 pointer-events-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 border border-[#10172b]"></span>
          </span>
        </div>

        {/* BOTÓN 3: Agendar Cita o Confirmar Reserva */}
        <div className="relative shrink-0 flex items-center gap-2">
          {totalItems > 0 && (
            <div className="flex flex-col text-right leading-none pr-1">
              <span className="text-[10px] text-slate-300 font-medium">
                {totalItems} {totalItems === 1 ? 'servicio' : 'servicios'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-white font-sans mt-0.5">
                {formatPrice(totalPrice)}
              </span>
            </div>
          )}

          <div className="relative">
            <Button
              type="button"
              variant="alfa"
              size="icon"
              onClick={totalItems > 0 ? onConfirmCartClick : onBookingClick}
              disabled={isBooking}
              className="w-12 h-12 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_12px_rgba(59,130,246,0.3)] cursor-pointer"
              title={totalItems > 0 ? "Confirmar Reserva" : "Reservar Cita"}
              aria-label={totalItems > 0 ? "Confirmar Reserva" : "Reservar Cita"}
            >
              {isBooking ? (
                <CustomLoader size={18} className="text-white" />
              ) : totalItems > 0 ? (
                <ArrowRight className="h-5 w-5 text-white" />
              ) : (
                <Calendar className="h-5 w-5 text-white" />
              )}
            </Button>

            {totalItems > 0 && !isBooking && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center border-2 border-[#10172b] shadow-sm pointer-events-none">
                {totalItems}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
