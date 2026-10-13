'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ShoppingBag, Eye, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AlfaProductsSectionProps {
  products: any[];
  onSelectProduct: (product: any) => void;
  onAddToCart?: (productId: string) => void;
  productCart?: string[];
  getProductCount?: (productId: string) => number;
  formatPrice: (price: number) => string;
  className?: string;
}

/**
 * Componente que envuelve cada producto con su efecto original de vitrina 3D (Showcase Tilt):
 * - Al entrar desde abajo (al venir de Cortes Reales): se eleva e inclina hacia el frente (rotateX: 20deg -> 0deg).
 * - En la zona de lectura central: permanece completamente plano, nítido y estable en su cuadrícula.
 * - Al salir hacia arriba: permanece quieto mientras el título sube y sale; la elevación e inclinación
 *   hacia atrás (rotateX: 0deg -> -18deg, y: 0 -> -65px) comienza exactamente a la misma altura
 *   que la sección de servicios (de 0.62 a 0.86), justo cuando la primera fila de imágenes va a salir por arriba.
 */
function ProductShowcaseCard({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'end start'],
  });

  // Stagger sutil para que no entren todas en un bloque completamente plano
  const stagger = (index % 4) * 0.025;

  // Curvas de animación:
  // 1. Entrada desde Cortes Reales (de 0.06 a 0.34 + stagger):
  //    La tarjeta se levanta de un ángulo de vitrina de 20deg a 0deg frontal, subiendo en Y y escalando a 1.0
  // 2. Zona central de lectura y compra (de 0.34 a 0.62):
  //    Completamente normal, centrada y fija (rotateX: 0deg, y: 0px, scale: 1.0, opacity: 1.0)
  //    mientras el título principal y subtítulo suben y salen de la pantalla
  // 3. Salida hacia la repisa superior (de 0.62 a 0.86):
  //    Comienza a la misma altura que las demás secciones (justo cuando la fila va a salir por arriba),
  //    inclinándose hacia atrás a -18deg, elevándose a -65px y desvaneciéndose suavemente.
  const rotateX = useTransform(
    scrollYProgress,
    [0.06 + stagger, 0.34 + stagger, 0.62, 0.86],
    [20, 0, 0, -18]
  );

  const y = useTransform(
    scrollYProgress,
    [0.06 + stagger, 0.34 + stagger, 0.62, 0.86],
    [65, 0, 0, -65]
  );

  const scale = useTransform(
    scrollYProgress,
    [0.06 + stagger, 0.34 + stagger, 0.62, 0.86],
    [0.90, 1, 1, 0.90]
  );

  const opacity = useTransform(
    scrollYProgress,
    [0.06 + stagger, 0.28 + stagger, 0.68, 0.86],
    [0, 1, 1, 0]
  );

  const pointerEvents = useTransform(
    scrollYProgress,
    (p) => (p > 0.84 || p < 0.12 ? 'none' : 'auto')
  ) as any;

  return (
    <div style={{ perspective: '1100px' }} className="w-full">
      <motion.div
        ref={cardRef}
        style={{
          rotateX,
          y,
          scale,
          opacity,
          pointerEvents,
          transformStyle: 'preserve-3d',
        }}
        className="w-full will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function AlfaProductsSection({
  products = [],
  onSelectProduct,
  productCart = [],
  getProductCount,
  formatPrice,
  className,
}: AlfaProductsSectionProps) {
  const visibleProducts = products.filter(
    (p: any) => p.active && (p.stock > 0 || p.stock === undefined) && p.visible_en_web !== false
  );

  if (visibleProducts.length === 0) return null;

  const isProductInCart = (id: string) => productCart.includes(id);

  return (
    <section id="productos" className={cn("py-16 md:py-24 bg-slate-50 border-t scroll-mt-20 overflow-x-clip", className)}>
      <div className="container px-3 sm:px-4 md:px-6 max-w-6xl mx-auto">
        {/* Section Header: Visible y limpio, sube de manera natural con el scroll */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs font-bold uppercase tracking-widest mb-2">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Gama Oficial</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-2 text-foreground">
            Productos Destacados
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            Lleva la experiencia de la barbería a tu casa.
          </p>
        </div>

        {/* Products Grid: Vitrina 3D con elevación e inclinación tridimensional */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {visibleProducts.map((product: any, idx: number) => {
            const isSelected = isProductInCart(product.id);
            const pCount = getProductCount ? getProductCount(product.id) : (isSelected ? 1 : 0);
            const hasImg = product.images && product.images.length > 0 && product.images[0];

            return (
              <ProductShowcaseCard key={product.id} index={idx}>
                <div
                  onClick={() => onSelectProduct(product)}
                  className={cn(
                    "group relative aspect-square w-full rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer select-none bg-slate-900 shadow-md hover:shadow-2xl hover:-translate-y-1",
                    isSelected
                      ? "border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.25)] ring-1 ring-blue-500"
                      : "border-border/60 hover:border-blue-400/70"
                  )}
                >
                  {/* Background Image */}
                  {hasImg ? (
                    <Image
                      src={product.images[0]}
                      alt={product.nombre}
                      fill
                      quality={85}
                      loading="lazy"
                      className="object-cover group-hover:scale-108 transition-transform duration-500"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      unoptimized={true}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400">
                      <ShoppingBag className="w-10 h-10 text-slate-400" />
                    </div>
                  )}

                  {/* Gradient overlays for contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent pointer-events-none" />

                  {/* Top Badges & Eye Icon Button */}
                  <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 flex items-start justify-between z-10">
                    <div className="flex flex-col gap-1">
                      {isSelected && (
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white flex items-center gap-1 shadow-md">
                          <Check className="w-2.5 h-2.5" />
                          {pCount > 1 ? `${pCount} en Pedido` : 'Agregado'}
                        </span>
                      )}
                    </div>

                    {/* Eye Icon Button: opens product details modal */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(product);
                      }}
                      className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center text-slate-200 hover:text-white bg-black/40 hover:bg-white/20 backdrop-blur-sm transition-all cursor-pointer shrink-0 shadow-sm"
                      title="Ver información del producto"
                      aria-label={`Ver información de ${product.nombre}`}
                    >
                      <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-200 group-hover:text-white" />
                    </button>
                  </div>

                  {/* Bottom content: Nombre sobre la imagen y Precio (font-sans) */}
                  <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 z-10">
                    <h3 className="font-bold text-xs sm:text-sm md:text-base text-white leading-tight drop-shadow-md line-clamp-2 group-hover:text-blue-300 transition-colors mb-1 sm:mb-1.5">
                      {product.nombre}
                    </h3>

                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-bold text-white drop-shadow font-sans">
                        {formatPrice(product.public_price)}
                      </span>
                    </div>
                  </div>
                </div>
              </ProductShowcaseCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
