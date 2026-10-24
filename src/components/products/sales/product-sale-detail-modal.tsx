'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, X, Calendar, User } from 'lucide-react';
import type { AggregatedProductSale } from '@/lib/types';

interface ProductSaleDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summary: AggregatedProductSale | null;
}

export function ProductSaleDetailModal({ isOpen, onOpenChange, summary }: ProductSaleDetailModalProps) {
  if (!summary) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        hideCloseButton={true}
        className="w-[95vw] sm:w-full max-w-2xl max-h-[85dvh] sm:max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Detalle de Ventas: {summary.nombre}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Desglose de todas las ventas para este producto en el período seleccionado.
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Contenido / Tarjetas con Scroll Vertical Suave (sin deslizamiento horizontal) */}
        <div className="p-3 sm:p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin overscroll-contain pr-1">
            {summary.details.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">
                No hay detalles de venta para este producto en el período seleccionado.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {summary.details.map((detail, index: number) => (
                  <div
                    key={detail.saleId + index}
                    className="rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-blue-500/40 transition-colors p-3 space-y-2 flex flex-col justify-between"
                  >
                    {/* Fila superior: Cliente y Recaudación */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-foreground truncate" title={detail.clientName}>
                          {detail.clientName || 'Cliente general'}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-sans">{detail.date}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-foreground font-sans">
                          ${detail.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-medium font-sans">
                          {detail.unitsSold} {detail.unitsSold === 1 ? 'unidad' : 'unidades'}
                        </p>
                      </div>
                    </div>

                    {/* Fila inferior: Vendedor */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Vendedor</span>
                      <div className="flex items-center gap-1.5 font-medium text-foreground text-xs truncate max-w-[65%]">
                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{detail.sellerName || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen Total y Botón de Cierre */}
          <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3 shrink-0 gap-2">
            <div className="text-xs text-muted-foreground font-sans flex items-center gap-1.5 flex-wrap">
              <span>Total:</span>
              <strong className="text-foreground font-sans font-semibold">{summary.unitsSold} {summary.unitsSold === 1 ? 'unidad' : 'unidades'}</strong>
              <span>•</span>
              <strong className="text-foreground font-bold text-sm font-sans">${summary.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</strong>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-xl border-border/60 text-xs shrink-0">
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
