'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Scissors, Package, Check, Sparkles, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getServiceLocalImage } from '@/lib/service-images';

interface AlfaServicesSectionProps {
  regularServices: any[];
  packageServices: any[];
  onSelectService: (service: any) => void;
  onAddToCart?: (serviceId: string) => void;
  cartServiceIds?: string[];
  formatPrice: (price: number) => string;
  getPackageDescription?: (name: string) => string | null;
  className?: string;
}

/**
 * Componente que envuelve cada tarjeta de servicio para animarla
 * hacia los bordes laterales (izq/der) conforme se hace scroll y va saliendo por la parte superior.
 */
function ScrollDepartingCard({
  children,
  index,
  columns,
}: {
  children: React.ReactNode;
  index: number;
  columns: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'end start'],
  });

  // Cálculo de dirección e intensidad según la columna donde se ubica la tarjeta
  const { xDir, factor, rot } = useMemo(() => {
    const colIndex = index % columns;

    if (columns <= 2) {
      // Móvil / Pantallas pequeñas (2 columnas)
      // 0 = izquierda (-1), 1 = derecha (+1)
      return {
        xDir: colIndex === 0 ? -1 : 1,
        factor: 1,
        rot: colIndex === 0 ? -5 : 5,
      };
    }

    if (columns === 3) {
      // Tablet (3 columnas): Izquierda, Centro, Derecha
      if (colIndex === 0) return { xDir: -1, factor: 1.1, rot: -5 };
      if (colIndex === 2) return { xDir: 1, factor: 1.1, rot: 5 };
      return { xDir: 0, factor: 0.1, rot: 0 };
    }

    // Desktop (4 columnas): Apertura orgánica simétrica (tipo puertas francesas / abanico)
    if (colIndex === 0) return { xDir: -1, factor: 1.35, rot: -7 };
    if (colIndex === 1) return { xDir: -1, factor: 0.5, rot: -2.5 };
    if (colIndex === 2) return { xDir: 1, factor: 0.5, rot: 2.5 };
    return { xDir: 1, factor: 1.35, rot: 7 };
  }, [index, columns]);

  const maxDistance = columns <= 2 ? 150 : 280;
  const targetX = xDir * factor * maxDistance;

  // Curvas de animación al hacer scroll:
  // - De 0 a 0.62: neutral y nítido (x: 0, scale: 1, opacity: 1, rot: 0) mientras el título y los filtros salen de la pantalla
  // - De 0.62 a 0.86: justo cuando la fila de imágenes va a salir por arriba, se abre fluidamente hacia los bordes laterales
  // - De 0.68 a 0.86: se desvanece de forma elegante al alcanzar el borde superior
  const x = useTransform(scrollYProgress, [0, 0.62, 0.86], [0, 0, targetX]);
  const rotate = useTransform(scrollYProgress, [0, 0.62, 0.86], [0, 0, rot]);
  const scale = useTransform(scrollYProgress, [0, 0.62, 0.86], [1, 1, 0.90]);
  const opacity = useTransform(scrollYProgress, [0, 0.68, 0.86], [1, 1, 0]);
  const pointerEvents = useTransform(scrollYProgress, (p) => (p > 0.84 ? 'none' : 'auto')) as any;

  return (
    <motion.div
      ref={cardRef}
      style={{
        x,
        rotate,
        scale,
        opacity,
        pointerEvents,
      }}
      className="w-full will-change-transform"
    >
      {children}
    </motion.div>
  );
}

/**
 * Subtítulo de sección ("SERVICIOS INDIVIDUALES" / "PAQUETES ALFA")
 * que se desvanece suavemente al subir por el scroll.
 */
function DepartingSubheader({
  icon: Icon,
  title,
}: {
  icon: any;
  title: string;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: headerRef,
    offset: ['start end', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.48, 0.70], [1, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.48, 0.70], [0, 0, -20]);

  return (
    <motion.div
      ref={headerRef}
      style={{ opacity, y }}
      className="flex items-center gap-3 mb-6 will-change-transform"
    >
      <Icon className="w-4 h-4 text-[#202A49]" />
      <span className="font-black text-xs sm:text-sm tracking-widest uppercase text-foreground">
        {title}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </motion.div>
  );
}

export function AlfaServicesSection({
  regularServices,
  packageServices,
  onSelectService,
  cartServiceIds = [],
  className,
}: AlfaServicesSectionProps) {
  const [activeFilter, setActiveFilter] = useState<'todos' | 'servicios' | 'paquetes'>('todos');
  const [columns, setColumns] = useState(4);

  // Detección reactiva de número de columnas activas en Tailwind CSS
  // (sm/móvil: 2, md/tablet: 3, lg/desktop: 4)
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setColumns(2);
      } else if (width < 1024) {
        setColumns(3);
      } else {
        setColumns(4);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalCount = regularServices.length + packageServices.length;
  const isServiceInCart = (id: string) => cartServiceIds.includes(id);

  const renderServiceCard = (service: any, isPackage: boolean) => {
    const isSelected = isServiceInCart(service.id);
    const localImg = getServiceLocalImage(service.name, service.images);

    return (
      <div
        onClick={() => onSelectService(service)}
        className={cn(
          "group relative aspect-square w-full rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer select-none bg-slate-900 shadow-md hover:shadow-2xl hover:-translate-y-1",
          isSelected
            ? "border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.25)] ring-1 ring-blue-500"
            : "border-border/60 hover:border-blue-400/70"
        )}
      >
        {/* Background Image */}
        {localImg ? (
          <Image
            src={localImg}
            alt={service.name}
            fill
            quality={85}
            loading="lazy"
            className="object-cover group-hover:scale-108 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={true}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400">
            {isPackage ? (
              <Sparkles className="w-10 h-10 text-slate-400" />
            ) : (
              <Scissors className="w-10 h-10 text-slate-400" />
            )}
          </div>
        )}

        {/* Degradado sutil únicamente en la parte inferior para legibilidad del texto sin oscurecer la imagen */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* Top badges & Eye icon button */}
        <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 flex items-start justify-between z-10">
          <div className="flex flex-col gap-1">
            {isSelected && (
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white flex items-center gap-1 shadow-md">
                <Check className="w-2.5 h-2.5" />
                Agregado
              </span>
            )}
          </div>

          {/* Botón con Icono de Ojo: abre modal con información y botón de agendar */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectService(service);
            }}
            className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center text-slate-200 hover:text-white bg-black/40 hover:bg-white/20 backdrop-blur-sm transition-all cursor-pointer shrink-0 shadow-sm"
            title="Ver información y agendar"
            aria-label={`Ver información de ${service.name}`}
          >
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-200 group-hover:text-white" />
          </button>
        </div>

        {/* Bottom content: Solo el Nombre del servicio */}
        <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 z-10">
          <h3 className="font-bold text-xs sm:text-sm md:text-base text-white leading-tight drop-shadow-md line-clamp-2 group-hover:text-blue-300 transition-colors">
            {service.name}
          </h3>
        </div>
      </div>
    );
  };

  return (
    <section id="servicios" className={cn("py-16 md:py-24 bg-slate-50 border-t scroll-mt-20 overflow-x-clip", className)}>
      <div className="container px-3 sm:px-4 md:px-6 max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold tracking-tight mb-2 text-foreground">
            Nuestros Servicios y Paquetes
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            Calidad, detalle y distinción en cada corte y ritual de barbería.
          </p>
        </div>

        {/* Category Filter Pills (Estilo App Móvil) */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-10 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveFilter('todos')}
            className={cn(
              "px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 shadow-sm",
              activeFilter === 'todos'
                ? "bg-[#202A49] text-white shadow-md border border-blue-500/40"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-border/60"
            )}
          >
            Todos ({totalCount})
          </button>

          <button
            onClick={() => setActiveFilter('servicios')}
            className={cn(
              "px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 shadow-sm",
              activeFilter === 'servicios'
                ? "bg-[#202A49] text-white shadow-md border border-blue-500/40"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-border/60"
            )}
          >
            <Scissors className="w-3.5 h-3.5" />
            Individuales ({regularServices.length})
          </button>

          <button
            onClick={() => setActiveFilter('paquetes')}
            className={cn(
              "px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 shadow-sm",
              activeFilter === 'paquetes'
                ? "bg-[#202A49] text-white shadow-md border border-blue-500/40"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-border/60"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Paquetes ({packageServices.length})
          </button>
        </div>

        {/* Content according to filter - 2 columns on mobile */}
        {activeFilter === 'todos' && (
          <div className="space-y-12">
            {/* Servicios Individuales */}
            <div>
              <DepartingSubheader icon={Scissors} title="SERVICIOS INDIVIDUALES" />

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                {regularServices.map((s, idx) => (
                  <ScrollDepartingCard key={s.id} index={idx} columns={columns}>
                    {renderServiceCard(s, false)}
                  </ScrollDepartingCard>
                ))}
              </div>
            </div>

            {/* Paquetes Alfa */}
            {packageServices.length > 0 && (
              <div>
                <DepartingSubheader icon={Package} title="PAQUETES ALFA" />

                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                  {packageServices.map((p, idx) => (
                    <ScrollDepartingCard key={p.id} index={idx} columns={columns}>
                      {renderServiceCard(p, true)}
                    </ScrollDepartingCard>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeFilter === 'servicios' && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {regularServices.map((s, idx) => (
              <ScrollDepartingCard key={s.id} index={idx} columns={columns}>
                {renderServiceCard(s, false)}
              </ScrollDepartingCard>
            ))}
          </div>
        )}

        {activeFilter === 'paquetes' && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {packageServices.map((p, idx) => (
              <ScrollDepartingCard key={p.id} index={idx} columns={columns}>
                {renderServiceCard(p, true)}
              </ScrollDepartingCard>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
